"""Скачивание вложений (только для авторизованной сессии)."""
from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.security.auth import current_session
from app.services import messages as svc
from app.utils import decode_folder_param

router = APIRouter(
    prefix="/api/accounts/{account_id}",
    tags=["attachments"],
    dependencies=[Depends(current_session)],
)


@router.get("/messages/{uid}/attachments/{part}")
async def download_attachment(
    account_id: int,
    uid: int,
    part: str,
    folder: str = Query(...),
    filename: str = Query(default="attachment"),
    content_type: str = Query(default="application/octet-stream"),
    inline: bool = Query(default=False),
) -> Response:
    folder_name = decode_folder_param(folder)
    data = await svc.get_attachment(account_id, folder_name, uid, part)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Вложение не найдено")
    disposition = "inline" if inline else "attachment"
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
        },
    )
