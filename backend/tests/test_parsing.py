"""Тесты парсинга MIME: кириллица в заголовках/телах, кодировки, snippet."""
from __future__ import annotations

from email.message import EmailMessage

from app.imap.parsing import (
    decode_body_part,
    decode_mime_header,
    make_snippet,
    parse_full_message,
)


def test_decode_header_utf8_cyrillic():
    raw = "=?UTF-8?B?0J/RgNC40LLQtdGC?="  # «Привет»
    assert decode_mime_header(raw) == "Привет"


def test_decode_header_koi8r_cyrillic():
    raw = "=?KOI8-R?B?98XS?="  # фрагмент в KOI8-R
    assert isinstance(decode_mime_header(raw), str)


def test_decode_header_plain_and_none():
    assert decode_mime_header("Hello") == "Hello"
    assert decode_mime_header(None) == ""


def test_decode_body_windows1251():
    text = "Тест кодировки"
    payload = text.encode("windows-1251")
    assert decode_body_part(payload, "windows-1251") == text


def test_decode_body_fallback_without_charset():
    text = "Привет мир"
    payload = text.encode("utf-8")
    assert decode_body_part(payload, None) == text


def test_make_snippet_collapses_whitespace():
    assert make_snippet("раз   два\n\nтри", length=100) == "раз два три"
    assert len(make_snippet("a" * 500, length=200)) == 200


def test_make_snippet_converts_html_to_text():
    html = """
    <!doctype html>
    <html>
      <head><style>.hidden { display: none; }</style></head>
      <body>
        <p>Новое&nbsp;сообщение</p>
        <div>от работодателя</div>
      </body>
    </html>
    """
    assert make_snippet(html, length=100) == "Новое сообщение от работодателя"


def test_parse_full_message_cyrillic_html_and_attachment():
    msg = EmailMessage()
    msg["Subject"] = "Тема письма"
    msg["From"] = "Отправитель <sender@example.com>"
    msg["To"] = "rcpt@example.com"
    msg.set_content("Текст письма в plain")
    msg.add_alternative("<p>Текст письма в <b>HTML</b></p>", subtype="html")
    msg.add_attachment(
        b"\x00\x01binary",
        maintype="application",
        subtype="octet-stream",
        filename="файл.bin",
    )

    parsed = parse_full_message(msg.as_bytes())
    assert parsed["subject"] == "Тема письма"
    assert "HTML" in (parsed["html"] or "")
    assert "plain" in (parsed["text"] or "")
    assert len(parsed["attachments"]) == 1
    assert parsed["attachments"][0]["filename"] == "файл.bin"
