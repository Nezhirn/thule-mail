"""Точка входа FastAPI: CORS, роутеры, lifespan (БД, прогрев пулов, поллинг)."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.database import close_db, get_db, init_db
from app.imap.client import ConnectionParams
from app.imap.pool import pool_manager
from app.routers import (
    accounts,
    attachments,
    auth,
    folders,
    messages,
    search,
    send,
    unified,
)
from app.security.crypto import decrypt
from app.services.messages import sync_all_enabled_inboxes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("thulemail")

_poller_task: asyncio.Task | None = None


async def _background_poller(interval: int) -> None:
    """Лёгкий фоновый поллинг INBOX всех включённых аккаунтов."""
    while True:
        await asyncio.sleep(interval)
        try:
            await sync_all_enabled_inboxes()
        except Exception as exc:
            logger.warning("Фоновый поллинг завершился ошибкой: %s", exc)


async def _warm_up_pools() -> None:
    """Прогреть пулы включённых аккаунтов, чтобы первый запрос не ждал логин."""
    db = get_db()
    rows = await db.fetchall("SELECT * FROM accounts WHERE enabled = 1")
    for row in rows:
        try:
            params = ConnectionParams(
                host=row["imap_host"],
                port=row["imap_port"],
                security=row["imap_security"],
                username=row["username"],
                password=decrypt(row["password_enc"]),
            )
            await pool_manager.get_or_create(
                row["id"], params, row["pool_size"], warm=True
            )
        except Exception as exc:
            logger.warning("Не удалось прогреть пул аккаунта %s: %s", row["id"], exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await init_db()
    await _warm_up_pools()

    global _poller_task
    _poller_task = asyncio.create_task(_background_poller(settings.sync_interval_seconds))

    yield

    if _poller_task is not None:
        _poller_task.cancel()
    await pool_manager.close_all()
    await close_db()


app = FastAPI(title="ThuleMail API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(folders.router)
app.include_router(messages.router)
app.include_router(unified.router)
app.include_router(send.router)
app.include_router(search.router)
app.include_router(attachments.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
