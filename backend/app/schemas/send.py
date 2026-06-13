from __future__ import annotations

from pydantic import BaseModel


class Attachment(BaseModel):
    filename: str
    content_type: str = "application/octet-stream"
    content_b64: str


class SendRequest(BaseModel):
    to: list[str]
    cc: list[str] = []
    bcc: list[str] = []
    subject: str = ""
    html: str | None = None
    text: str | None = None
    attachments: list[Attachment] = []
    in_reply_to: str | None = None


class SendResult(BaseModel):
    ok: bool
    message_id: str
