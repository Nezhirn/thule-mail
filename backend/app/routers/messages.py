"""Эндпоинты писем: список из кэша, одно письмо, флаги, move/delete, sync.

Папка передаётся query-параметром (base64url), не сегментом пути.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas.message import FlagRequest, MessageList
from app.security.auth import current_session
from app.services import messages as svc
from app.services import sync as sync_svc
from app.utils import decode_folder_param

router = APIRouter(
    prefix="/api/accounts/{account_id}",
    tags=["messages"],
    dependencies=[Depends(current_session)],
)


@router.get("/messages", response_model=MessageList)
async def get_messages(
    account_id: int,
    folder: str = Query(..., description="Имя папки (base64url)"),
    cursor: int | None = Query(default=None),
    limit: int = Query(default=50, le=200),
) -> dict:
    folder_name = decode_folder_param(folder)
    return await svc.list_messages(account_id, folder_name, cursor, limit)


@router.get("/messages/{uid}")
async def get_one_message(
    account_id: int,
    uid: int,
    folder: str = Query(...),
    mark_seen: bool = Query(default=False),
) -> dict:
    folder_name = decode_folder_param(folder)
    try:
        return await svc.get_message(account_id, folder_name, uid, mark_seen=mark_seen)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/messages/{uid}/flags", status_code=status.HTTP_204_NO_CONTENT)
async def update_flags(
    account_id: int,
    uid: int,
    body: FlagRequest,
    folder: str = Query(...),
):
    folder_name = decode_folder_param(folder)
    await svc.set_flags(account_id, folder_name, uid, body.flags, body.add)


@router.post("/messages/{uid}/move", status_code=status.HTTP_204_NO_CONTENT)
async def move_message(
    account_id: int,
    uid: int,
    folder: str = Query(...),
    dest: str = Query(..., description="Целевая папка (base64url)"),
):
    src = decode_folder_param(folder)
    dst = decode_folder_param(dest)
    await svc.move_message(account_id, src, uid, dst)


@router.delete("/messages/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    account_id: int,
    uid: int,
    folder: str = Query(...),
):
    folder_name = decode_folder_param(folder)
    await svc.delete_message(account_id, folder_name, uid)


@router.post("/messages/mark_all_read")
async def mark_all_read(
    account_id: int,
    folder: str = Query(...),
) -> dict:
    folder_name = decode_folder_param(folder)
    try:
        affected = await svc.mark_all_read(account_id, folder_name)
        return {"affected": affected}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Ошибка: {exc}"
        ) from exc


@router.post("/sync")
async def force_sync(
    account_id: int,
    folder: str = Query(default="INBOX"),
) -> dict:
    folder_name = decode_folder_param(folder)
    try:
        return await sync_svc.sync_folder(account_id, folder_name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Ошибка синхронизации: {exc}"
        ) from exc
