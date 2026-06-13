"""CRUD аккаунтов, автоопределение и проверка соединения.

Пароли всегда хранятся зашифрованными (Fernet); наружу не отдаются.
"""
from __future__ import annotations

import aiosqlite

from app.db.database import get_db
from app.imap import client as imap_client
from app.imap.client import ConnectionParams
from app.imap.pool import pool_manager, run_with_temp_connection
from app.schemas.account import AccountCreate, AccountUpdate
from app.security.crypto import decrypt, encrypt

# Поля, которые отдаём наружу (без password_enc).
_PUBLIC_COLUMNS = (
    "id, email, display_name, color, imap_host, imap_port, imap_security, "
    "smtp_host, smtp_port, smtp_security, username, enabled, pool_size, "
    "sync_interval_sec, page_size, sort_order"
)


def row_to_public(row: aiosqlite.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    return d


def connection_params_from_row(row: aiosqlite.Row) -> ConnectionParams:
    """Собрать параметры IMAP-подключения из строки БД (расшифровать пароль)."""
    return ConnectionParams(
        host=row["imap_host"],
        port=row["imap_port"],
        security=row["imap_security"],
        username=row["username"],
        password=decrypt(row["password_enc"]),
    )


async def list_accounts() -> list[dict]:
    db = get_db()
    rows = await db.fetchall(
        f"SELECT {_PUBLIC_COLUMNS} FROM accounts ORDER BY sort_order, id"
    )
    return [row_to_public(r) for r in rows]


async def get_account_public(account_id: int) -> dict | None:
    db = get_db()
    row = await db.fetchone(
        f"SELECT {_PUBLIC_COLUMNS} FROM accounts WHERE id = ?", (account_id,)
    )
    return row_to_public(row) if row else None


async def get_account_row(account_id: int) -> aiosqlite.Row | None:
    """Полная строка, включая password_enc — для внутреннего использования."""
    db = get_db()
    return await db.fetchone("SELECT * FROM accounts WHERE id = ?", (account_id,))


async def create_account(data: AccountCreate) -> dict:
    db = get_db()
    account_id = await db.execute(
        """
        INSERT INTO accounts (
            email, display_name, color, imap_host, imap_port, imap_security,
            smtp_host, smtp_port, smtp_security, username, password_enc,
            pool_size, sync_interval_sec, page_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(data.email), data.display_name, data.color,
            data.imap_host, data.imap_port, data.imap_security,
            data.smtp_host, data.smtp_port, data.smtp_security,
            data.username, encrypt(data.password),
            data.pool_size, data.sync_interval_sec, data.page_size,
        ),
    )
    return await get_account_public(account_id)  # type: ignore[return-value]


async def update_account(account_id: int, data: AccountUpdate) -> dict | None:
    db = get_db()
    fields = data.model_dump(exclude_unset=True)
    if not fields:
        return await get_account_public(account_id)

    sets: list[str] = []
    params: list = []
    for key, value in fields.items():
        if key == "password":
            sets.append("password_enc = ?")
            params.append(encrypt(value))
        elif key == "enabled":
            sets.append("enabled = ?")
            params.append(1 if value else 0)
        else:
            sets.append(f"{key} = ?")
            params.append(value)
    sets.append("updated_at = datetime('now')")
    params.append(account_id)

    await db.execute(
        f"UPDATE accounts SET {', '.join(sets)} WHERE id = ?", params
    )
    # Параметры подключения могли измениться — сбросим пул.
    await pool_manager.drop(account_id)
    return await get_account_public(account_id)


async def delete_account(account_id: int) -> None:
    db = get_db()
    await pool_manager.drop(account_id)
    await db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))


async def test_connection(params: ConnectionParams) -> tuple[bool, str, list[str]]:
    """Проверить подключение одноразовым соединением; вернуть список папок."""
    try:
        folders = await run_with_temp_connection(
            params, imap_client.list_folders
        )
        names = [f["name"] for f in folders]
        return True, f"Успешно: {len(names)} папок", names
    except Exception as exc:  # понятное сообщение наверх
        return False, f"Ошибка подключения: {exc}", []
