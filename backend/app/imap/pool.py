"""Пул IMAP-соединений на каждый аккаунт.

IMAP-соединение НЕ потокобезопасно и НЕ переиспользуется конкурентно —
параллельные запросы берут разные соединения из пула. Пул:
- держит N открытых соединений (прогрев при создании);
- сериализует доступ к каждому соединению через asyncio.Queue;
- исполняет блокирующие операции IMAPClient в собственном ThreadPoolExecutor;
- переподключается с экспоненциальным backoff при обрыве.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any, Awaitable, Callable

from imapclient import IMAPClient
from imapclient.exceptions import IMAPClientAbortError, IMAPClientError

from app.imap.client import ConnectionParams, connect

logger = logging.getLogger(__name__)


class ImapPool:
    """Пул соединений для одного аккаунта."""

    def __init__(self, params: ConnectionParams, size: int = 3) -> None:
        self._params = params
        self._size = max(1, size)
        self._executor = ThreadPoolExecutor(max_workers=self._size, thread_name_prefix="imap")
        self._queue: asyncio.Queue[IMAPClient] = asyncio.Queue(maxsize=self._size)
        self._created = 0
        self._lock = asyncio.Lock()

    async def warm_up(self) -> None:
        """Заранее открыть соединения, чтобы первый запрос не ждал логин."""
        for _ in range(self._size):
            try:
                conn = await self._create_connection()
                await self._queue.put(conn)
            except Exception as exc:  # прогрев не должен валить старт
                logger.warning("Не удалось прогреть IMAP-соединение: %s", exc)
                break

    async def _create_connection(self, max_retries: int = 4) -> IMAPClient:
        loop = asyncio.get_running_loop()
        delay = 1.0
        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                conn = await loop.run_in_executor(self._executor, connect, self._params)
                self._created += 1
                return conn
            except Exception as exc:  # backoff на нестабильных серверах
                last_exc = exc
                logger.warning(
                    "Подключение к IMAP %s не удалось (попытка %d): %s",
                    self._params.host, attempt + 1, exc,
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, 16)
        raise ConnectionError(
            f"Не удалось подключиться к IMAP {self._params.host}: {last_exc}"
        )

    async def _is_alive(self, conn: IMAPClient) -> bool:
        """Проверить живость соединения дешёвым NOOP.

        Провайдеры вроде mail.ru/bk.ru закрывают простаивающие IMAP-сессии,
        поэтому прогретые соединения протухают. NOOP перед выдачей гарантирует,
        что наружу уйдёт живое соединение.
        """
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(self._executor, conn.noop)
            return True
        except Exception:
            return False

    async def _get_live_conn(self) -> IMAPClient:
        """Вернуть гарантированно живое соединение (из пула или новое)."""
        async with self._lock:
            while not self._queue.empty():
                conn = self._queue.get_nowait()
                if await self._is_alive(conn):
                    return conn
                self._created -= 1
                await self._safe_logout(conn)
            if self._created < self._size:
                return await self._create_connection()
        # Пул занят — подождать освобождения и проверить живость.
        conn = await self._queue.get()
        if await self._is_alive(conn):
            return conn
        async with self._lock:
            self._created -= 1
        await self._safe_logout(conn)
        return await self._get_live_conn()

    @asynccontextmanager
    async def _acquire(self):
        """Взять живое соединение из пула (или создать)."""
        conn = await self._get_live_conn()
        broken = False
        try:
            yield conn
        except (IMAPClientAbortError, ConnectionError, OSError) as exc:
            # Соединение оборвалось — пометить как сломанное, не возвращать в пул.
            broken = True
            logger.warning("IMAP-соединение оборвано, переподключаюсь: %s", exc)
            raise
        finally:
            if broken:
                async with self._lock:
                    self._created -= 1
                await self._safe_logout(conn)
            else:
                await self._queue.put(conn)

    async def run(self, fn: Callable[..., Any], *args: Any) -> Any:
        """Выполнить блокирующую операцию client.* на соединении из пула.

        fn вызывается как fn(conn, *args) внутри executor'а. При обрыве —
        одна повторная попытка на свежем соединении.

        ВНИМАНИЕ: для последовательности зависимых операций (SELECT → SEARCH →
        FETCH) используйте session(): состояние выбранной папки живёт в одном
        соединении, и разные run() могут попасть на разные соединения пула.
        """
        loop = asyncio.get_running_loop()
        try:
            async with self._acquire() as conn:
                return await loop.run_in_executor(self._executor, fn, conn, *args)
        except (IMAPClientAbortError, ConnectionError, OSError):
            async with self._acquire() as conn:
                return await loop.run_in_executor(self._executor, fn, conn, *args)

    @asynccontextmanager
    async def session(self):
        """Закрепить ОДНО соединение на серию операций (SELECT+SEARCH+FETCH).

        Внутри блока возвращается корутина run(fn, *args), всегда выполняющая
        fn на одном и том же соединении. Между вызовами можно делать async-работу
        (запись в БД) — соединение удерживается эксклюзивно этой задачей.
        """
        loop = asyncio.get_running_loop()
        async with self._acquire() as conn:
            async def run(fn: Callable[..., Any], *args: Any) -> Any:
                return await loop.run_in_executor(self._executor, fn, conn, *args)
            yield run

    async def close(self) -> None:
        while not self._queue.empty():
            conn = self._queue.get_nowait()
            await self._safe_logout(conn)
        self._executor.shutdown(wait=False)

    async def _safe_logout(self, conn: IMAPClient) -> None:
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(self._executor, _logout, conn)
        except Exception:
            pass


def _logout(conn: IMAPClient) -> None:
    try:
        conn.logout()
    except (IMAPClientError, OSError):
        pass


class PoolManager:
    """Реестр пулов по account_id."""

    def __init__(self) -> None:
        self._pools: dict[int, ImapPool] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(
        self, account_id: int, params: ConnectionParams, size: int, warm: bool = False
    ) -> ImapPool:
        async with self._lock:
            pool = self._pools.get(account_id)
            if pool is None:
                pool = ImapPool(params, size=size)
                self._pools[account_id] = pool
                if warm:
                    await pool.warm_up()
            return pool

    def get(self, account_id: int) -> ImapPool | None:
        return self._pools.get(account_id)

    async def drop(self, account_id: int) -> None:
        async with self._lock:
            pool = self._pools.pop(account_id, None)
        if pool is not None:
            await pool.close()

    async def close_all(self) -> None:
        async with self._lock:
            pools = list(self._pools.values())
            self._pools.clear()
        for pool in pools:
            await pool.close()


# Единый менеджер на процесс.
pool_manager = PoolManager()


async def run_with_temp_connection(
    params: ConnectionParams, fn: Callable[[IMAPClient], Any]
) -> Any:
    """Одноразовое соединение вне пула — для test-connection до сохранения аккаунта."""
    loop = asyncio.get_running_loop()
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        conn = await loop.run_in_executor(executor, connect, params)
        try:
            return await loop.run_in_executor(executor, fn, conn)
        finally:
            await loop.run_in_executor(executor, _logout, conn)
    finally:
        executor.shutdown(wait=False)


# Аннотация для совместимости типов
RunFn = Callable[..., Awaitable[Any]]
