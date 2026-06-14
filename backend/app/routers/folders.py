"""Папки аккаунта и слой кастомизации (порядок/pin/hide/алиасы)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.db.database import get_db
from app.schemas.message import FolderLayoutUpdate
from app.security.auth import current_session
from app.services import messages as svc

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/accounts/{account_id}/folders",
    tags=["folders"],
    dependencies=[Depends(current_session)],
)


@router.get("")
async def get_folders(account_id: int) -> list[dict]:
    try:
        return await svc.list_folders(account_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("list_folders %s: %s", account_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось получить список папок",
        ) from exc


@router.patch("/layout", status_code=status.HTTP_204_NO_CONTENT)
async def update_layout(account_id: int, body: FolderLayoutUpdate):
    db = get_db()
    for item in body.items:
        await db.execute(
            """
            INSERT INTO folder_layout (account_id, folder, alias, sort_order, pinned, hidden)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id, folder) DO UPDATE SET
                alias = excluded.alias,
                sort_order = excluded.sort_order,
                pinned = excluded.pinned,
                hidden = excluded.hidden
            """,
            (
                account_id, item.folder, item.alias, item.sort_order,
                1 if item.pinned else 0, 1 if item.hidden else 0,
            ),
        )
