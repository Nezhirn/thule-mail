"""Точка входа FastAPI: CORS, роутеры, lifespan (БД, прогрев пулов, поллинг)."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

    # Fail-fast: в проде запрещаем небезопасные дефолты/пустые секреты.
    problems = settings.validate_for_production()
    if problems:
        raise RuntimeError(
            "Небезопасная конфигурация для production:\n  - "
            + "\n  - ".join(problems)
            + "\nЗадайте корректные значения в .env (см. .env.example)."
        )

    await init_db()
    await _warm_up_pools()

    global _poller_task
    _poller_task = asyncio.create_task(_background_poller(settings.sync_interval_seconds))

    yield

    # Сначала корректно дождаться отмены поллера, чтобы он не работал
    # с уже закрытыми пулами/БД.
    if _poller_task is not None:
        _poller_task.cancel()
        try:
            await _poller_task
        except asyncio.CancelledError:
            pass
    await pool_manager.close_all()
    await close_db()


settings = get_settings()

# В проде закрываем интерактивную документацию и схему.
_docs_kwargs = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None}
    if settings.is_prod
    else {}
)
app = FastAPI(title="ThuleMail API", version="0.1.0", lifespan=lifespan, **_docs_kwargs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Не светим трейсбэки/детали наружу: логируем, отдаём общее сообщение."""
    logger.exception("Необработанное исключение на %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Внутренняя ошибка сервера"},
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


@app.get("/")
async def root() -> dict:
    return {
        "status": "ok",
        "service": "ThuleMail API",
        "docs": "/docs",
        "health": "/api/health",
    }
