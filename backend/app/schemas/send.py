from __future__ import annotations

from pydantic import BaseModel, field_validator

# Лимит суммарного размера вложений (декодированных), защита от OOM.
_MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024


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

    @field_validator("attachments")
    @classmethod
    def _limit_total_size(cls, attachments: list[Attachment]) -> list[Attachment]:
        # base64 ~4/3 от исходного размера; оцениваем декодированный объём.
        total = sum(len(a.content_b64) * 3 // 4 for a in attachments)
        if total > _MAX_ATTACHMENTS_BYTES:
            raise ValueError(
                f"Суммарный размер вложений превышает лимит "
                f"{_MAX_ATTACHMENTS_BYTES // (1024 * 1024)} МБ"
            )
        return attachments


class SendResult(BaseModel):
    ok: bool
    message_id: str
