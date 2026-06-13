from __future__ import annotations

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionInfo(BaseModel):
    authenticated: bool
    user: str | None = None
