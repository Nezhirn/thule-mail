"""Пакет IMAP-слоя.

Здесь же применяется патч совместимости с Python 3.14: в стандартном
imaplib атрибут IMAP4.file стал read-only property, а IMAPClient на путях
SSL/STARTTLS всё ещё делает `self._imap.file = ...`. Возвращаем settable
property поверх внутреннего `_file`, который imaplib использует сам.
"""
from __future__ import annotations

import imaplib

_file_prop = getattr(imaplib.IMAP4, "file", None)
if isinstance(_file_prop, property) and _file_prop.fset is None:
    imaplib.IMAP4.file = property(  # type: ignore[assignment]
        lambda self: getattr(self, "_file", None),
        lambda self, value: setattr(self, "_file", value),
    )
