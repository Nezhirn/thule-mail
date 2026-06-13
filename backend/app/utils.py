"""Мелкие утилиты, общие для роутеров/сервисов."""
from __future__ import annotations

import base64


def decode_folder_param(value: str) -> str:
    """Имя папки приходит как base64url (не-ASCII и разделители в путях).

    Распознаём base64url по round-trip: декодируем и сверяем обратное
    кодирование с входом. Иначе считаем, что пришло «сырое» имя
    (удобно для разработки/совместимости).
    """
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded_bytes = base64.urlsafe_b64decode(padded.encode("ascii"))
        if encode_folder_param(decoded_bytes.decode("utf-8")) == value.rstrip("="):
            return decoded_bytes.decode("utf-8")
    except Exception:
        pass
    return value


def encode_folder_param(folder: str) -> str:
    return base64.urlsafe_b64encode(folder.encode("utf-8")).decode("ascii").rstrip("=")
