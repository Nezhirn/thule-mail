"""Эндпоинты управления аккаунтами."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.imap.client import ConnectionParams
from app.providers import autodetect
from app.schemas.account import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    AutodetectResult,
    TestConnectionRequest,
    TestConnectionResult,
)
from app.security.auth import current_session
from app.services import accounts as svc

router = APIRouter(
    prefix="/api/accounts",
    tags=["accounts"],
    dependencies=[Depends(current_session)],
)


@router.get("", response_model=list[AccountOut])
async def get_accounts() -> list[dict]:
    return await svc.list_accounts()


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def add_account(body: AccountCreate) -> dict:
    return await svc.create_account(body)


@router.get("/autodetect", response_model=AutodetectResult)
async def detect(email: str) -> AutodetectResult:
    preset = autodetect(email)
    if preset is None:
        return AutodetectResult(detected=False)
    return AutodetectResult(**preset)


@router.post("/test", response_model=TestConnectionResult)
async def test(body: TestConnectionRequest) -> TestConnectionResult:
    params = ConnectionParams(
        host=body.imap_host,
        port=body.imap_port,
        security=body.imap_security,
        username=body.username,
        password=body.password,
    )
    ok, message, folders = await svc.test_connection(params)
    return TestConnectionResult(ok=ok, message=message, folders=folders)


@router.patch("/{account_id}", response_model=AccountOut)
async def edit_account(account_id: int, body: AccountUpdate) -> dict:
    updated = await svc.update_account(account_id, body)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Аккаунт не найден")
    return updated


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_account(account_id: int):
    if await svc.get_account_public(account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Аккаунт не найден")
    await svc.delete_account(account_id)
