"""Инкрементальная синхронизация папки в локальный кэш (SQLite).

Принципы:
- тянем ТОЛЬКО заголовки/конверты (ENVELOPE/FLAGS/BODYSTRUCTURE), не тела;
- запоминаем UIDVALIDITY и наибольший засинхроненный UID на папку;
- при смене UIDVALIDITY инвалидируем кэш папки и синкаем заново;
- на первом синке берём последнее окно писем (page_size), остальное — лениво.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

from app.db.database import get_db
from app.imap import client as imap_client
from app.imap.client import ConnectionParams
from app.imap.parsing import (
    bodystructure_has_attachments,
    envelope_to_dict,
)
from app.imap.pool import ImapPool, pool_manager
from app.services.accounts import connection_params_from_row, get_account_row

logger = logging.getLogger(__name__)

# Блокировки на (account_id, folder): фоновый поллинг и ручной sync не должны
# синхронизировать одну папку одновременно (гонки на sync_state/кэше).
_sync_locks: dict[tuple[int, str], asyncio.Lock] = defaultdict(asyncio.Lock)


async def _get_pool(account_id: int) -> tuple[ImapPool, ConnectionParams]:
    row = await get_account_row(account_id)
    if row is None:
        raise ValueError(f"Аккаунт {account_id} не найден")
    params = connection_params_from_row(row)
    pool = await pool_manager.get_or_create(account_id, params, row["pool_size"])
    return pool, params


async def _get_sync_state(account_id: int, folder: str) -> tuple[int, int]:
    db = get_db()
    row = await db.fetchone(
        "SELECT uidvalidity, last_uid FROM sync_state WHERE account_id = ? AND folder = ?",
        (account_id, folder),
    )
    if row is None:
        return 0, 0
    return int(row["uidvalidity"]), int(row["last_uid"])


async def _save_sync_state(account_id: int, folder: str, uidvalidity: int, last_uid: int) -> None:
    db = get_db()
    await db.execute(
        """
        INSERT INTO sync_state (account_id, folder, uidvalidity, last_uid, last_sync_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id, folder) DO UPDATE SET
            uidvalidity = excluded.uidvalidity,
            last_uid = excluded.last_uid,
            last_sync_at = excluded.last_sync_at
        """,
        (account_id, folder, uidvalidity, last_uid, datetime.now(timezone.utc).isoformat()),
    )


async def _clear_folder_cache(account_id: int, folder: str) -> None:
    db = get_db()
    await db.execute(
        "DELETE FROM messages_cache WHERE account_id = ? AND folder = ?",
        (account_id, folder),
    )


def _flags_to_str(flags) -> str:
    parts = [f.decode() if isinstance(f, bytes) else str(f) for f in (flags or ())]
    return " ".join(parts)


async def sync_folder(account_id: int, folder: str, limit: int = 100) -> dict:
    """Синхронизировать одну папку (под per-folder lock).

    Вся последовательность SELECT→SEARCH→FETCH идёт на ОДНОМ соединении
    (pool.session), иначе FETCH/SEARCH попадут на невыбранное соединение.
    Lock не даёт фоновому поллингу и ручному sync конкурировать за одну папку.
    """
    pool, _ = await _get_pool(account_id)
    async with _sync_locks[(account_id, folder)]:
        return await _sync_folder_locked(pool, account_id, folder, limit)


async def _sync_folder_locked(pool: ImapPool, account_id: int, folder: str, limit: int) -> dict:
    async with pool.session() as run:
        # 1. Выбрать папку (readonly — не трогаем \\Seen) и узнать UIDVALIDITY.
        info = await run(imap_client.select_folder, folder, True)
        uidvalidity = info["uidvalidity"]

        stored_validity, last_uid = await _get_sync_state(account_id, folder)
        if stored_validity and stored_validity != uidvalidity:
            logger.info("UIDVALIDITY изменился для %s/%s — инвалидирую кэш", account_id, folder)
            await _clear_folder_cache(account_id, folder)
            last_uid = 0

        # 2. Получить список UID.
        all_uids = sorted(await run(imap_client.search_uids, "ALL"))
        if not all_uids:
            await _save_sync_state(account_id, folder, uidvalidity, 0)
            return {"folder": folder, "new": 0, "total": 0}

        if last_uid == 0:
            new_uids = all_uids[-limit:]  # первый синк — только последнее окно
        else:
            new_uids = [u for u in all_uids if u > last_uid]

        # 3. Освежить флаги недавнего окна (прочитано/помечено меняется без новых UID).
        refresh_window = [u for u in all_uids[-limit:] if u <= last_uid]

        new_count = await _fetch_and_store(run, account_id, folder, uidvalidity, new_uids)
        if refresh_window:
            await _refresh_flags(run, account_id, folder, refresh_window)

    max_uid = max(all_uids)
    await _save_sync_state(account_id, folder, uidvalidity, max_uid)
    return {"folder": folder, "new": new_count, "total": len(all_uids)}


async def _fetch_and_store(
    run, account_id: int, folder: str, uidvalidity: int, uids: list[int]
) -> int:
    if not uids:
        return 0
    db = get_db()
    # тянем порциями, чтобы не держать огромный FETCH
    stored = 0
    chunk = 100
    for i in range(0, len(uids), chunk):
        batch = uids[i : i + chunk]
        resp = await run(imap_client.fetch_headers, batch)
        rows = []
        for uid, data in resp.items():
            envelope = data.get(b"ENVELOPE")
            if envelope is None:
                continue
            env_dict = envelope_to_dict(envelope)
            flags = _flags_to_str(data.get(b"FLAGS"))
            internaldate = data.get(b"INTERNALDATE")
            internaldate_iso = (
                internaldate.isoformat() if hasattr(internaldate, "isoformat") else None
            )
            has_att = bodystructure_has_attachments(data.get(b"BODYSTRUCTURE"))
            size = int(data.get(b"RFC822.SIZE", 0) or 0)
            # snippet оставляем пустым на этапе списка: тела не тянем.
            # Заполнится при первом открытии письма (см. messages.get_message).
            rows.append((
                account_id, folder, int(uid), uidvalidity,
                json.dumps(env_dict, ensure_ascii=False), flags,
                internaldate_iso, "",
                1 if has_att else 0, size,
            ))
        if rows:
            await db.executemany(
                """
                INSERT INTO messages_cache (
                    account_id, folder, uid, uidvalidity, envelope_json, flags,
                    internaldate, snippet, has_attachments, size
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_id, folder, uid) DO UPDATE SET
                    flags = excluded.flags,
                    envelope_json = excluded.envelope_json,
                    has_attachments = excluded.has_attachments
                """,
                rows,
            )
            stored += len(rows)
    return stored


async def _refresh_flags(
    run, account_id: int, folder: str, uids: list[int]
) -> None:
    db = get_db()
    resp = await run(imap_client.fetch_headers, uids)
    updates = []
    for uid, data in resp.items():
        updates.append((_flags_to_str(data.get(b"FLAGS")), account_id, folder, int(uid)))
    if updates:
        await db.executemany(
            "UPDATE messages_cache SET flags = ? WHERE account_id = ? AND folder = ? AND uid = ?",
            updates,
        )


async def sync_account_inbox(account_id: int) -> dict:
    """Синхронизировать INBOX аккаунта (используется фоновым поллингом)."""
    return await sync_folder(account_id, "INBOX")
