"""Отправка писем через SMTP (aiosmtplib)."""
from __future__ import annotations

import base64
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import aiosmtplib

from app.security.crypto import decrypt
from app.services.accounts import get_account_row


async def send_message(
    account_id: int,
    to: list[str],
    cc: list[str],
    bcc: list[str],
    subject: str,
    html: str | None,
    text: str | None,
    attachments: list[dict],
    in_reply_to: str | None = None,
) -> str:
    """Собрать MIME и отправить. Возвращает Message-ID."""
    row = await get_account_row(account_id)
    if row is None:
        raise ValueError("Аккаунт не найден")

    msg = EmailMessage()
    from_name = row["display_name"] or ""
    msg["From"] = formataddr((from_name, row["email"]))
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    message_id = make_msgid()
    msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to

    # Тело: text как основной, html как альтернатива.
    plain = text or _html_to_text_fallback(html or "")
    msg.set_content(plain)
    if html:
        msg.add_alternative(html, subtype="html")

    for att in attachments:
        content = base64.b64decode(att["content_b64"])
        maintype, _, subtype = att.get("content_type", "application/octet-stream").partition("/")
        msg.add_attachment(
            content,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=att.get("filename", "attachment"),
        )

    recipients = to + cc + bcc
    security = row["smtp_security"].upper()
    password = decrypt(row["password_enc"])

    await aiosmtplib.send(
        msg,
        recipients=recipients,
        hostname=row["smtp_host"],
        port=row["smtp_port"],
        username=row["username"],
        password=password,
        use_tls=(security == "SSL"),
        start_tls=(security == "STARTTLS"),
    )
    return message_id


def _html_to_text_fallback(html: str) -> str:
    import re

    text = re.sub(r"<[^>]+>", " ", html)
    return " ".join(text.split())
