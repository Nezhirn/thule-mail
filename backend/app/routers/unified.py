"""Объединённый входящий: письма INBOX всех включённых аккаунтов из кэша."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.schemas.message import MessageList
from app.security.auth import current_session
from app.services import messages as svc

router = APIRouter(
    prefix="/api/unified",
    tags=["unified"],
    dependencies=[Depends(current_session)],
)


@router.get("/messages", response_model=MessageList)
async def unified_messages(
    cursor: int | None = Query(default=None),
    limit: int = Query(default=50, le=200),
) -> dict:
    return await svc.unified_inbox(cursor, limit)
