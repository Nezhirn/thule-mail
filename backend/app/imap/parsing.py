"""Парсинг MIME: заголовки, конверты (ENVELOPE), структура тела, кодировки.

Ключевые задачи:
- декодирование заголовков (decode_header) с поддержкой кириллицы;
- превращение ENVELOPE из IMAPClient в плоский dict для кэша;
- определение наличия вложений по BODYSTRUCTURE;
- выбор text/html vs text/plain и устойчивое декодирование тел
  (UTF-8 → Windows-1251 → KOI8-R → latin-1 как крайний случай);
- генерация короткого snippet из text/plain.
"""
from __future__ import annotations

import email
import re
from html import unescape
from html.parser import HTMLParser
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parsedate_to_datetime
from typing import Any

# Порядок попыток декодирования тел без явного/корректного charset.
_FALLBACK_CHARSETS = ("utf-8", "windows-1251", "koi8-r", "latin-1")


def decode_mime_header(raw: Any) -> str:
    """Декодировать MIME-заголовок (RFC 2047) в обычную строку.

    Принимает str / bytes / None. Кириллица в темах обрабатывается здесь.
    """
    if raw is None:
        return ""
    if isinstance(raw, bytes):
        raw = _safe_decode(raw)
    try:
        return str(make_header(decode_header(raw))).strip()
    except Exception:
        return str(raw).strip()


def _safe_decode(data: bytes) -> str:
    for cs in _FALLBACK_CHARSETS:
        try:
            return data.decode(cs)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", errors="replace")


def decode_body_part(payload: bytes, charset: str | None) -> str:
    """Декодировать байты тела с учётом заявленного charset и фолбэков."""
    charsets: list[str] = []
    if charset:
        charsets.append(charset)
    charsets.extend(c for c in _FALLBACK_CHARSETS if c != charset)
    for cs in charsets:
        try:
            return payload.decode(cs)
        except (UnicodeDecodeError, LookupError):
            continue
    return payload.decode("utf-8", errors="replace")


# ── ENVELOPE → dict ─────────────────────────────────────────────────────────
def _format_address(addr: Any) -> dict[str, str]:
    """IMAPClient Address → {'name': ..., 'email': ...}."""
    name = decode_mime_header(addr.name) if addr.name else ""
    mailbox = _as_text(addr.mailbox)
    host = _as_text(addr.host)
    email_addr = f"{mailbox}@{host}" if mailbox and host else (mailbox or host)
    return {"name": name, "email": email_addr}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return _safe_decode(value)
    return str(value)


def _addr_list(addrs: Any) -> list[dict[str, str]]:
    if not addrs:
        return []
    return [_format_address(a) for a in addrs]


def envelope_to_dict(envelope: Any) -> dict[str, Any]:
    """Преобразовать объект Envelope из IMAPClient в сериализуемый dict."""
    date_iso: str | None = None
    if envelope.date is not None:
        try:
            date_iso = envelope.date.isoformat()
        except Exception:
            date_iso = None

    return {
        "subject": decode_mime_header(envelope.subject),
        "date": date_iso,
        "from": _addr_list(envelope.from_),
        "sender": _addr_list(envelope.sender),
        "reply_to": _addr_list(envelope.reply_to),
        "to": _addr_list(envelope.to),
        "cc": _addr_list(envelope.cc),
        "bcc": _addr_list(envelope.bcc),
        "in_reply_to": _as_text(envelope.in_reply_to),
        "message_id": _as_text(envelope.message_id),
    }


# ── BODYSTRUCTURE → наличие вложений ────────────────────────────────────────
def bodystructure_has_attachments(structure: Any) -> bool:
    """Грубая эвристика: есть ли в структуре часть с disposition=attachment
    или непустым именем файла.
    """
    try:
        return _walk_structure_for_attachments(structure)
    except Exception:
        return False


def _walk_structure_for_attachments(part: Any) -> bool:
    # IMAPClient возвращает вложенные кортежи; multipart — список частей,
    # последний элемент — subtype. Простые части содержат поля MIME.
    if isinstance(part, (list, tuple)):
        # multipart: первые элементы — вложенные части
        if part and isinstance(part[0], (list, tuple)):
            for sub in part:
                if isinstance(sub, (list, tuple)) and _walk_structure_for_attachments(sub):
                    return True
            return False
        # простая часть: ищем disposition
        for item in part:
            if isinstance(item, (list, tuple)):
                for token in _flatten(item):
                    if isinstance(token, (bytes, str)):
                        t = token.decode() if isinstance(token, bytes) else token
                        if t.lower() in ("attachment", "filename", "name"):
                            return True
    return False


def _flatten(seq: Any):
    for el in seq:
        if isinstance(el, (list, tuple)):
            yield from _flatten(el)
        else:
            yield el


# ── Парсинг полного письма (RFC822) для просмотра ───────────────────────────
def parse_full_message(raw: bytes) -> dict[str, Any]:
    """Распарсить сырое письмо в структуру для просмотра:
    html/text тело, список вложений (без содержимого — только метаданные).
    """
    msg: Message = email.message_from_bytes(raw)

    html_body: str | None = None
    text_body: str | None = None
    attachments: list[dict[str, Any]] = []

    for part_index, part in enumerate(msg.walk()):
        if part.is_multipart():
            continue
        content_type = part.get_content_type()
        disposition = (part.get("Content-Disposition") or "").lower()
        filename = part.get_filename()
        if filename:
            filename = decode_mime_header(filename)

        is_attachment = "attachment" in disposition or (
            filename and content_type not in ("text/plain", "text/html")
        )

        if is_attachment:
            payload = part.get_payload(decode=True) or b""
            attachments.append({
                "part": str(part_index),
                "filename": filename or f"part-{part_index}",
                "content_type": content_type,
                "size": len(payload),
                "is_inline": "inline" in disposition,
                "content_id": (part.get("Content-ID") or "").strip("<>") or None,
            })
            continue

        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        charset = part.get_content_charset()
        decoded = decode_body_part(payload, charset)
        if content_type == "text/html" and html_body is None:
            html_body = decoded
        elif content_type == "text/plain" and text_body is None:
            text_body = decoded

    return {
        "subject": decode_mime_header(msg.get("Subject")),
        "from": decode_mime_header(msg.get("From")),
        "to": decode_mime_header(msg.get("To")),
        "cc": decode_mime_header(msg.get("Cc")),
        "date": _parse_date(msg.get("Date")),
        "message_id": (msg.get("Message-ID") or "").strip(),
        "html": html_body,
        "text": text_body,
        "attachments": attachments,
    }


def _parse_date(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw).isoformat()
    except Exception:
        return None


class _SnippetHTMLParser(HTMLParser):
    """Минимальный HTML→text для preview без внешних зависимостей."""

    _BLOCK_TAGS = {
        "address", "article", "aside", "blockquote", "br", "div", "footer",
        "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "p",
        "pre", "section", "table", "td", "th", "tr",
    }
    _SKIP_TAGS = {"script", "style", "head", "title", "meta", "noscript"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in self._SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth == 0 and tag in self._BLOCK_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self._SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth == 0 and tag in self._BLOCK_TAGS:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


def _looks_like_html(text: str) -> bool:
    return bool(re.search(r"<!doctype|<html\b|<body\b|</?[a-z][\w:-]*(?:\s[^>]*)?>", text, re.I))


def _html_to_text(text: str) -> str:
    parser = _SnippetHTMLParser()
    try:
        parser.feed(text)
        parser.close()
        return parser.text()
    except Exception:
        return re.sub(r"<[^>]+>", " ", text)


def make_snippet(text: str, length: int = 200) -> str:
    """Короткое превью письма: HTML превращаем в текст, пробелы схлопываем."""
    source = _html_to_text(text) if _looks_like_html(text) else text
    collapsed = " ".join(unescape(source).split())
    return collapsed[:length]
