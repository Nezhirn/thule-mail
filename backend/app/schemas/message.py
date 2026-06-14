from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class MessageListItem(BaseModel):
    account_id: int
    folder: str
    uid: int
    subject: str
    from_: list[dict] = []
    to: list[dict] = []
    date: str | None = None
    snippet: str = ""
    flags: list[str] = []
    seen: bool = False
    flagged: bool = False
    answered: bool = False
    has_attachments: bool = False
    size: int = 0
    # только для unified inbox
    account_color: str | None = None
    account_email: str | None = None

    class Config:
        populate_by_name = True


class MessageList(BaseModel):
    messages: list[dict[str, Any]]
    next_cursor: int | None = None


class FlagRequest(BaseModel):
    flags: list[str]
    add: bool = True


class BulkFlagRequest(FlagRequest):
    uids: list[int]


class BulkDeleteRequest(BaseModel):
    uids: list[int]


class FolderLayoutItem(BaseModel):
    folder: str
    alias: str | None = None
    sort_order: int = 0
    pinned: bool = False
    hidden: bool = False


class FolderLayoutUpdate(BaseModel):
    items: list[FolderLayoutItem]
