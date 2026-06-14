"""Низкоуровневая обёртка над IMAPClient (синхронная).

Все функции здесь блокирующие и вызываются ИЗ executor'а (см. pool.py).
Соединение IMAP не потокобезопасно — одно соединение используется строго
одним запросом одновременно (это гарантирует пул).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from imapclient import IMAPClient

logger = logging.getLogger(__name__)

# Заголовки, которые тянем для списка вместе с ENVELOPE при необходимости.
LIST_FETCH_ITEMS = [b"ENVELOPE", b"FLAGS", b"INTERNALDATE", b"BODYSTRUCTURE", b"RFC822.SIZE"]


@dataclass(frozen=True)
class ConnectionParams:
    """Параметры подключения к одному ящику (пароль уже расшифрован)."""
    host: str
    port: int
    security: str  # SSL | STARTTLS | NONE
    username: str
    password: str


def connect(params: ConnectionParams, timeout: int = 30) -> IMAPClient:
    """Установить и залогинить IMAP-соединение.

    Аутентификация абстрагирована: сейчас login/пароль, позже сюда же ляжет
    XOAUTH2 (client.oauth2_login) без изменения вызывающего кода пула.
    """
    use_ssl = params.security.upper() == "SSL"
    client = IMAPClient(params.host, port=params.port, ssl=use_ssl, timeout=timeout)
    if params.security.upper() == "STARTTLS":
        client.starttls()
    client.login(params.username, params.password)
    return client


def list_folders(client: IMAPClient) -> list[dict]:
    """Список папок с флагами и разделителем."""
    result = []
    for flags, delimiter, name in client.list_folders():
        result.append({
            "name": name,
            "delimiter": delimiter.decode() if isinstance(delimiter, bytes) else delimiter,
            "flags": [f.decode() if isinstance(f, bytes) else f for f in flags],
        })
    return result


def select_folder(client: IMAPClient, folder: str, readonly: bool = True) -> dict:
    """Выбрать папку. readonly=True (EXAMINE) — чтобы не менять флаги."""
    info = client.select_folder(folder, readonly=readonly)
    return {
        "uidvalidity": int(info.get(b"UIDVALIDITY", 0)),
        "exists": int(info.get(b"EXISTS", 0)),
        "uidnext": int(info.get(b"UIDNEXT", 0)),
    }


def search_uids(client: IMAPClient, criteria: list | str = "ALL") -> list[int]:
    """UID'ы сообщений по критерию (по умолчанию все в выбранной папке)."""
    return [int(u) for u in client.search(criteria)]


def fetch_headers(client: IMAPClient, uids: list[int]) -> dict[int, dict]:
    """FETCH конвертов/флагов/структуры для списка UID (без тел!)."""
    if not uids:
        return {}
    return client.fetch(uids, LIST_FETCH_ITEMS)


def fetch_body(client: IMAPClient, uid: int) -> bytes | None:
    """Лениво тянуть полное тело письма. BODY.PEEK[] — НЕ выставляет \\Seen."""
    resp = client.fetch([uid], [b"BODY.PEEK[]"])
    data = resp.get(uid)
    if not data:
        return None
    return data.get(b"BODY[]") or data.get(b"BODY[]<0>")


def fetch_part(client: IMAPClient, uid: int, part: str) -> bytes | None:
    """Тянуть конкретную MIME-часть (вложение) по её номеру."""
    section = f"BODY.PEEK[{part}]".encode()
    resp = client.fetch([uid], [section])
    data = resp.get(uid)
    if not data:
        return None
    # ключ в ответе — без PEEK
    for key, value in data.items():
        if isinstance(key, bytes) and key.startswith(b"BODY[") and value:
            return value
    return None


def set_flags(client: IMAPClient, uid: int, flags: list[str], add: bool) -> None:
    """Добавить/снять флаги (\\Seen, \\Flagged и т.п.). Нужна папка в RW-режиме."""
    if add:
        client.add_flags([uid], flags)
    else:
        client.remove_flags([uid], flags)


# Размер батча UID в одной IMAP-команде. Длинный список UID, перечисленный
# через запятую, может превысить лимит строки сервера (mail.ru: 16 КБ) и дать
# «No LF found in first 16384 bytes». 500 UID ≈ 3 КБ — с большим запасом.
_BULK_CHUNK = 500


def _chunks(uids: list[int], size: int = _BULK_CHUNK):
    for i in range(0, len(uids), size):
        yield uids[i : i + size]


def set_flags_bulk(client: IMAPClient, uids: list[int], flags: list[str], add: bool) -> None:
    """Добавить/снять флаги для множества UID (батчами, чтобы не превысить лимит строки)."""
    if not uids:
        return
    for batch in _chunks(uids):
        if add:
            client.add_flags(batch, flags)
        else:
            client.remove_flags(batch, flags)


def move_message(client: IMAPClient, uid: int, dest_folder: str) -> None:
    """Переместить письмо в другую папку (с фолбэком на copy+delete)."""
    try:
        client.move([uid], dest_folder)
    except Exception:
        client.copy([uid], dest_folder)
        client.delete_messages([uid])
        client.expunge()


def delete_message(client: IMAPClient, uid: int) -> None:
    client.delete_messages([uid])
    client.expunge()


def delete_messages_bulk(client: IMAPClient, uids: list[int]) -> None:
    """Удалить несколько писем (батчами, чтобы не превысить лимит строки сервера)."""
    if not uids:
        return
    for batch in _chunks(uids):
        client.delete_messages(batch)
    client.expunge()
