"""Тонкая обёртка над aiosqlite: единое соединение, инициализация схемы,
вспомогательные методы fetch/execute с включённым row_factory.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, Iterable, Sequence

import aiosqlite

from app.config import get_settings

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class Database:
    """Обёртка вокруг одного aiosqlite-соединения.

    SQLite сериализует запись сам; для нашей нагрузки (локальный кэш self-hosted)
    одного соединения достаточно. WAL включаем для конкурентного чтения.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        self._conn: aiosqlite.Connection | None = None
        # Единственное соединение делит commit на всю транзакцию, поэтому
        # сериализуем запись: иначе commit одной корутины зафиксирует
        # наполовину выполненный батч другой (фоновый поллинг + запросы).
        self._write_lock = asyncio.Lock()

    async def connect(self) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(self._path)) or ".", exist_ok=True)
        self._conn = await aiosqlite.connect(self._path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA journal_mode=WAL;")
        await self._conn.execute("PRAGMA foreign_keys=ON;")
        await self._init_schema()

    async def _init_schema(self) -> None:
        assert self._conn is not None
        schema = _SCHEMA_PATH.read_text(encoding="utf-8")
        await self._conn.executescript(schema)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("Database is not connected")
        return self._conn

    # ── helpers ────────────────────────────────────────────────────────────
    async def fetchone(self, sql: str, params: Sequence[Any] = ()) -> aiosqlite.Row | None:
        async with self.conn.execute(sql, params) as cur:
            return await cur.fetchone()

    async def fetchall(self, sql: str, params: Sequence[Any] = ()) -> list[aiosqlite.Row]:
        async with self.conn.execute(sql, params) as cur:
            return list(await cur.fetchall())

    async def execute(self, sql: str, params: Sequence[Any] = ()) -> int:
        """Выполнить запись, вернуть lastrowid (под write-lock)."""
        async with self._write_lock:
            cur = await self.conn.execute(sql, params)
            await self.conn.commit()
            return cur.lastrowid or 0

    async def executemany(self, sql: str, seq: Iterable[Sequence[Any]]) -> None:
        async with self._write_lock:
            await self.conn.executemany(sql, seq)
            await self.conn.commit()


# Единый инстанс на процесс.
_db: Database | None = None


async def init_db() -> Database:
    global _db
    if _db is None:
        _db = Database(get_settings().database_path)
        await _db.connect()
    return _db


def get_db() -> Database:
    if _db is None:
        raise RuntimeError("Database is not initialized; call init_db() on startup")
    return _db


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None
