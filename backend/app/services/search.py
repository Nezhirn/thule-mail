"""Поиск: сначала по локальному кэшу (мгновенно), при необходимости — IMAP SEARCH."""
from __future__ import annotations

from app.db.database import get_db
from app.imap import client as imap_client
from app.services.messages import _row_to_message
from app.services.sync import _get_pool


async def search_cache(query: str, account_id: int | None, limit: int = 100) -> list[dict]:
    """Поиск по кэшу: тема/отправитель/snippet (envelope_json + snippet)."""
    db = get_db()
    like = f"%{query}%"
    if account_id is not None:
        rows = await db.fetchall(
            """
            SELECT account_id, folder, uid, envelope_json, flags, internaldate,
                   snippet, has_attachments, size
            FROM messages_cache
            WHERE account_id = ? AND (envelope_json LIKE ? OR snippet LIKE ?)
            ORDER BY internaldate DESC LIMIT ?
            """,
            (account_id, like, like, limit),
        )
    else:
        rows = await db.fetchall(
            """
            SELECT account_id, folder, uid, envelope_json, flags, internaldate,
                   snippet, has_attachments, size
            FROM messages_cache
            WHERE envelope_json LIKE ? OR snippet LIKE ?
            ORDER BY internaldate DESC LIMIT ?
            """,
            (like, like, limit),
        )
    return [_row_to_message(r) for r in rows]


async def search_imap(account_id: int, folder: str, query: str) -> list[int]:
    """Серверный IMAP SEARCH по теме/телу — UID'ы (для углублённого поиска)."""
    pool, _ = await _get_pool(account_id)
    await pool.run(imap_client.select_folder, folder, True)
    criteria = ["OR", "SUBJECT", query, "BODY", query]
    return await pool.run(imap_client.search_uids, criteria)
