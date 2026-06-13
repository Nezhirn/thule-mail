"""Поиск по письмам (кэш → IMAP). scope: account | all."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.security.auth import current_session
from app.services import search as search_svc

router = APIRouter(prefix="/api/search", tags=["search"], dependencies=[Depends(current_session)])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    account_id: int | None = Query(default=None),
    scope: str = Query(default="all", pattern="^(account|all)$"),
) -> dict:
    target_account = account_id if scope == "account" else None
    results = await search_svc.search_cache(q, target_account)
    return {"messages": results, "count": len(results)}
