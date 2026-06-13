"""Эндпоинты сессии приложения."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.config import get_settings
from app.schemas.auth import LoginRequest, SessionInfo
from app.security.auth import (
    COOKIE_NAME,
    create_session_token,
    current_session,
    verify_credentials,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=SessionInfo)
async def login(body: LoginRequest, response: Response) -> SessionInfo:
    if not verify_credentials(body.username, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль"
        )
    token = create_session_token(body.username)
    settings = get_settings()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # за TLS-прокси в проде выставить True
        max_age=settings.jwt_ttl_hours * 3600,
        path="/",
    )
    return SessionInfo(authenticated=True, user=body.username)


@router.post("/logout", response_model=SessionInfo)
async def logout(response: Response) -> SessionInfo:
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return SessionInfo(authenticated=False, user=None)


@router.get("/me", response_model=SessionInfo)
async def me(subject: str = Depends(current_session)) -> SessionInfo:
    return SessionInfo(authenticated=True, user=subject)
