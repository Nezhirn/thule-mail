"""Конфигурация приложения через pydantic-settings.

Все секреты и параметры берутся из переменных окружения / .env.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Сессия приложения
    secret_key: str = "dev-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 24

    # Единственный пользователь (self-hosted)
    app_user: str = "admin"
    app_password: str = "admin"

    # Шифрование учёток ящиков (Fernet). Если пусто — сгенерируем эфемерный
    # ключ на старте (только для разработки; данные не переживут рестарт).
    encryption_key: str = ""

    # CORS — домены фронтенда через запятую
    allowed_origins: str = "http://localhost:3000"

    # Хранилище
    database_path: str = "./data/thulemail.db"

    # IMAP / синхронизация
    imap_pool_size: int = 3
    sync_interval_seconds: int = 60

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
