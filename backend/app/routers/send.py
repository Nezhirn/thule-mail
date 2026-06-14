"""Отправка писем."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.send import SendRequest, SendResult
from app.security.auth import current_session
from app.services import smtp as smtp_svc

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/accounts/{account_id}",
    tags=["send"],
    dependencies=[Depends(current_session)],
)


@router.post("/send", response_model=SendResult)
async def send(account_id: int, body: SendRequest) -> SendResult:
    try:
        message_id = await smtp_svc.send_message(
            account_id=account_id,
            to=body.to,
            cc=body.cc,
            bcc=body.bcc,
            subject=body.subject,
            html=body.html,
            text=body.text,
            attachments=[a.model_dump() for a in body.attachments],
            in_reply_to=body.in_reply_to,
        )
        return SendResult(ok=True, message_id=message_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("send from account %s: %s", account_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось отправить письмо",
        ) from exc
