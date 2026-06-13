"""JWT-сессия приложения для единственного пользователя (self-hosted).

Логин проверяется против APP_USER/APP_PASSWORD, выдаётся JWT, который кладётся
в httpOnly cookie. Зависимость current_session защищает приватные эндпоинты.
"""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, HTTPException, status
from jose import JWTError, jwt

from app.config import get_settings

COOKIE_NAME = "thulemail_session"


def verify_credentials(username: str, password: str) -> bool:
    settings = get_settings()
    # Сравнение в постоянное время, чтобы не утекать длину/совпадение по времени.
    user_ok = hmac.compare_digest(username, settings.app_user)
    pass_ok = hmac.compare_digest(password, settings.app_password)
    return user_ok and pass_ok


def create_session_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


async def current_session(
    thulemail_session: str | None = Cookie(default=None),
) -> str:
    """Зависимость FastAPI: возвращает subject сессии или бросает 401."""
    if not thulemail_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация"
        )
    try:
        payload = decode_session_token(thulemail_session)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия недействительна"
        ) from exc
    return payload.get("sub", "")
