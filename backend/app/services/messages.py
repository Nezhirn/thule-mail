"""Список писем из кэша, ленивое тело, флаги, move/delete, объединённый инбокс."""
from __future__ import annotations

import asyncio
import json
import logging

from app.db.database import get_db
from app.imap import client as imap_client
from app.imap.parsing import make_snippet, parse_full_message
from app.services.accounts import get_account_row
from app.services.sync import _get_pool

logger = logging.getLogger(__name__)


def _row_to_message(row) -> dict:
    d = dict(row)
    envelope = json.loads(d.pop("envelope_json"))
    flags = d.get("flags", "").split()
    return {
        "account_id": d["account_id"],
        "folder": d["folder"],
        "uid": d["uid"],
        "subject": envelope.get("subject", ""),
        "from": envelope.get("from", []),
        "to": envelope.get("to", []),
        "date": envelope.get("date") or d.get("internaldate"),
        "internaldate": d.get("internaldate"),
        "snippet": d.get("snippet", ""),
        "flags": flags,
        "seen": "\\Seen" in flags,
        "flagged": "\\Flagged" in flags,
        "answered": "\\Answered" in flags,
        "has_attachments": bool(d.get("has_attachments")),
        "size": d.get("size", 0),
    }


async def list_messages(
    account_id: int, folder: str, cursor: int | None, limit: int
) -> dict:
    """Список писем из SQLite (мгновенно). cursor — internaldate-пагинация по offset.

    Для простоты используем offset-пагинацию по internaldate DESC: cursor = offset.
    """
    db = get_db()
    offset = cursor or 0
    rows = await db.fetchall(
        """
        SELECT account_id, folder, uid, envelope_json, flags, internaldate,
               snippet, has_attachments, size
        FROM messages_cache
        WHERE account_id = ? AND folder = ?
        ORDER BY internaldate DESC, uid DESC
        LIMIT ? OFFSET ?
        """,
        (account_id, folder, limit, offset),
    )
    messages = [_row_to_message(r) for r in rows]
    next_cursor = offset + limit if len(rows) == limit else None
    return {"messages": messages, "next_cursor": next_cursor}


async def get_message(account_id: int, folder: str, uid: int, mark_seen: bool = False) -> dict:
    """Одно письмо с ленивой подгрузкой тела (BODY.PEEK — не трогает \\Seen)."""
    pool, _ = await _get_pool(account_id)
    # readonly=not mark_seen: если хотим отметить прочитанным — открываем RW
    await pool.run(imap_client.select_folder, folder, not mark_seen)
    raw = await pool.run(imap_client.fetch_body, uid)
    if raw is None:
        raise ValueError("Письмо не найдено на сервере")

    parsed = parse_full_message(raw)

    # Обновим snippet в кэше из text/plain (или из html как фолбэк).
    snippet_source = parsed.get("text") or parsed.get("html") or ""
    snippet = make_snippet(snippet_source)
    db = get_db()
    await db.execute(
        "UPDATE messages_cache SET snippet = ? WHERE account_id = ? AND folder = ? AND uid = ?",
        (snippet, account_id, folder, uid),
    )

    if mark_seen:
        await set_flags(account_id, folder, uid, ["\\Seen"], add=True)

    return {
        "account_id": account_id,
        "folder": folder,
        "uid": uid,
        **parsed,
    }


async def set_flags(
    account_id: int, folder: str, uid: int, flags: list[str], add: bool
) -> None:
    pool, _ = await _get_pool(account_id)
    await pool.run(imap_client.select_folder, folder, False)  # RW
    await pool.run(imap_client.set_flags, uid, flags, add)
    # Обновим кэш.
    db = get_db()
    row = await db.fetchone(
        "SELECT flags FROM messages_cache WHERE account_id = ? AND folder = ? AND uid = ?",
        (account_id, folder, uid),
    )
    if row is not None:
        current = set(row["flags"].split())
        if add:
            current.update(flags)
        else:
            current.difference_update(flags)
        await db.execute(
            "UPDATE messages_cache SET flags = ? WHERE account_id = ? AND folder = ? AND uid = ?",
            (" ".join(sorted(current)), account_id, folder, uid),
        )


async def move_message(account_id: int, folder: str, uid: int, dest: str) -> None:
    pool, _ = await _get_pool(account_id)
    await pool.run(imap_client.select_folder, folder, False)
    await pool.run(imap_client.move_message, uid, dest)
    db = get_db()
    await db.execute(
        "DELETE FROM messages_cache WHERE account_id = ? AND folder = ? AND uid = ?",
        (account_id, folder, uid),
    )


async def delete_message(account_id: int, folder: str, uid: int) -> None:
    pool, _ = await _get_pool(account_id)
    await pool.run(imap_client.select_folder, folder, False)
    await pool.run(imap_client.delete_message, uid)
    db = get_db()
    await db.execute(
        "DELETE FROM messages_cache WHERE account_id = ? AND folder = ? AND uid = ?",
        (account_id, folder, uid),
    )


async def get_attachment(account_id: int, folder: str, uid: int, part: str) -> bytes | None:
    pool, _ = await _get_pool(account_id)
    await pool.run(imap_client.select_folder, folder, True)
    return await pool.run(imap_client.fetch_part, uid, part)


async def unified_inbox(cursor: int | None, limit: int) -> dict:
    """Объединённый INBOX: письма INBOX всех включённых аккаунтов из кэша.

    Источник — SQLite (не живой IMAP). Свежесть обеспечивает фоновый поллинг.
    """
    db = get_db()
    offset = cursor or 0
    rows = await db.fetchall(
        """
        SELECT m.account_id, m.folder, m.uid, m.envelope_json, m.flags,
               m.internaldate, m.snippet, m.has_attachments, m.size,
               a.color AS account_color, a.email AS account_email
        FROM messages_cache m
        JOIN accounts a ON a.id = m.account_id
        WHERE m.folder = 'INBOX' AND a.enabled = 1
        ORDER BY m.internaldate DESC, m.uid DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    messages = []
    for r in rows:
        msg = _row_to_message(r)
        msg["account_color"] = r["account_color"]
        msg["account_email"] = r["account_email"]
        messages.append(msg)
    next_cursor = offset + limit if len(rows) == limit else None
    return {"messages": messages, "next_cursor": next_cursor}


async def list_folders(account_id: int) -> list[dict]:
    """Список папок аккаунта (живой IMAP) с наложенным слоем кастомизации."""
    row = await get_account_row(account_id)
    if row is None:
        raise ValueError("Аккаунт не найден")
    pool, _ = await _get_pool(account_id)
    folders = await pool.run(imap_client.list_folders)

    db = get_db()
    layout_rows = await db.fetchall(
        "SELECT folder, alias, sort_order, pinned, hidden FROM folder_layout WHERE account_id = ?",
        (account_id,),
    )
    layout = {r["folder"]: dict(r) for r in layout_rows}

    # счётчики непрочитанного из кэша
    # instr избавляет от мороки с экранированием backslash в LIKE.
    unread_rows = await db.fetchall(
        """
        SELECT folder, COUNT(*) AS unread FROM messages_cache
        WHERE account_id = ? AND instr(flags, '\\Seen') = 0
        GROUP BY folder
        """,
        (account_id,),
    )
    unread = {r["folder"]: r["unread"] for r in unread_rows}

    result = []
    for f in folders:
        name = f["name"]
        custom = layout.get(name, {})
        result.append({
            "name": name,
            "delimiter": f["delimiter"],
            "flags": f["flags"],
            "alias": custom.get("alias"),
            "sort_order": custom.get("sort_order", 0),
            "pinned": bool(custom.get("pinned", 0)),
            "hidden": bool(custom.get("hidden", 0)),
            "unread": unread.get(name, 0),
        })
    return result


async def sync_all_enabled_inboxes() -> None:
    """Фоновый поллинг: синк INBOX всех включённых аккаунтов параллельно."""
    from app.services.sync import sync_account_inbox  # избегаем цикла импорта

    db = get_db()
    rows = await db.fetchall("SELECT id FROM accounts WHERE enabled = 1")
    async def _safe(aid: int):
        try:
            await sync_account_inbox(aid)
        except Exception as exc:
            logger.warning("Фоновый синк аккаунта %s не удался: %s", aid, exc)

    await asyncio.gather(*(_safe(r["id"]) for r in rows))
