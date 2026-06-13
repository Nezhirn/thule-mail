"""Автоопределение настроек IMAP/SMTP по домену e-mail.

Таблица популярных провайдеров. Пользователь вводит почту и пароль —
остальное подставляется, с возможностью ручной правки на фронте.
"""
from __future__ import annotations

from typing import Any

# domain → настройки. security: SSL | STARTTLS | NONE
_PROVIDERS: dict[str, dict[str, Any]] = {
    "gmail.com": {
        "imap_host": "imap.gmail.com", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.gmail.com", "smtp_port": 465, "smtp_security": "SSL",
        "note": "Требуется пароль приложения (app password); обычный пароль не подойдёт.",
    },
    "yandex.ru": {
        "imap_host": "imap.yandex.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.yandex.ru", "smtp_port": 465, "smtp_security": "SSL",
        "note": "Включите доступ по IMAP и используйте пароль приложения.",
    },
    "ya.ru": {
        "imap_host": "imap.yandex.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.yandex.ru", "smtp_port": 465, "smtp_security": "SSL",
    },
    "mail.ru": {
        "imap_host": "imap.mail.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.mail.ru", "smtp_port": 465, "smtp_security": "SSL",
        "note": "Используйте пароль для внешних приложений.",
    },
    "inbox.ru": {
        "imap_host": "imap.mail.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.mail.ru", "smtp_port": 465, "smtp_security": "SSL",
    },
    "list.ru": {
        "imap_host": "imap.mail.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.mail.ru", "smtp_port": 465, "smtp_security": "SSL",
    },
    "bk.ru": {
        "imap_host": "imap.mail.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.mail.ru", "smtp_port": 465, "smtp_security": "SSL",
    },
    "outlook.com": {
        "imap_host": "outlook.office365.com", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.office365.com", "smtp_port": 587, "smtp_security": "STARTTLS",
    },
    "hotmail.com": {
        "imap_host": "outlook.office365.com", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.office365.com", "smtp_port": 587, "smtp_security": "STARTTLS",
    },
    "office365.com": {
        "imap_host": "outlook.office365.com", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.office365.com", "smtp_port": 587, "smtp_security": "STARTTLS",
    },
    "icloud.com": {
        "imap_host": "imap.mail.me.com", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.mail.me.com", "smtp_port": 587, "smtp_security": "STARTTLS",
        "note": "Требуется пароль приложения Apple ID.",
    },
    "fastmail.com": {
        "imap_host": "imap.fastmail.com", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.fastmail.com", "smtp_port": 465, "smtp_security": "SSL",
    },
    "rambler.ru": {
        "imap_host": "imap.rambler.ru", "imap_port": 993, "imap_security": "SSL",
        "smtp_host": "smtp.rambler.ru", "smtp_port": 465, "smtp_security": "SSL",
    },
}


def autodetect(email: str) -> dict[str, Any] | None:
    """Вернуть настройки по домену e-mail или None, если домен неизвестен."""
    if "@" not in email:
        return None
    domain = email.rsplit("@", 1)[1].strip().lower()
    preset = _PROVIDERS.get(domain)
    if preset is None:
        return None
    result = dict(preset)
    result["domain"] = domain
    result["detected"] = True
    return result
