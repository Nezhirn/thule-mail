from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field


class AccountBase(BaseModel):
    email: EmailStr
    display_name: str = ""
    color: str = "#3b82f6"
    imap_host: str
    imap_port: int = 993
    imap_security: str = "SSL"
    smtp_host: str
    smtp_port: int = 465
    smtp_security: str = "SSL"
    username: str
    pool_size: int = 3
    sync_interval_sec: int = 60
    page_size: int = 50


class AccountCreate(AccountBase):
    password: str = Field(min_length=1)


class AccountUpdate(BaseModel):
    """Все поля опциональны — частичное обновление (вкл/выкл, цвет, настройки)."""
    display_name: str | None = None
    color: str | None = None
    imap_host: str | None = None
    imap_port: int | None = None
    imap_security: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_security: str | None = None
    username: str | None = None
    password: str | None = None
    enabled: bool | None = None
    pool_size: int | None = None
    sync_interval_sec: int | None = None
    page_size: int | None = None
    sort_order: int | None = None


class AccountOut(BaseModel):
    """Аккаунт без пароля — то, что отдаём наружу."""
    id: int
    email: str
    display_name: str
    color: str
    imap_host: str
    imap_port: int
    imap_security: str
    smtp_host: str
    smtp_port: int
    smtp_security: str
    username: str
    enabled: bool
    pool_size: int
    sync_interval_sec: int
    page_size: int
    sort_order: int


class TestConnectionRequest(BaseModel):
    imap_host: str
    imap_port: int = 993
    imap_security: str = "SSL"
    username: str
    password: str


class TestConnectionResult(BaseModel):
    ok: bool
    message: str
    folders: list[str] = []


class AutodetectResult(BaseModel):
    detected: bool
    domain: str | None = None
    imap_host: str | None = None
    imap_port: int | None = None
    imap_security: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_security: str | None = None
    note: str | None = None
