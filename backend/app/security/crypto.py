"""Шифрование учёток почтовых ящиков (Fernet).

Пароли к IMAP/SMTP нельзя хешировать — их нужно расшифровывать при подключении.
Ключ берётся из ENCRYPTION_KEY. Если он не задан, генерируем эфемерный ключ
(только для разработки — данные не переживут перезапуск, о чём предупреждаем).
"""
from __future__ import annotations

import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = get_settings().encryption_key.strip()
        if not key:
            key = Fernet.generate_key().decode()
            logger.warning(
                "ENCRYPTION_KEY не задан — сгенерирован эфемерный ключ. "
                "Сохранённые учётки не переживут перезапуск. Задайте ENCRYPTION_KEY в .env."
            )
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    try:
        return _get_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError(
            "Не удалось расшифровать учётку — вероятно, изменился ENCRYPTION_KEY."
        ) from exc
