"""Конфигурация приложения через pydantic-settings.

Все секреты и параметры берутся из переменных окружения / .env.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Небезопасные дефолты, которые нельзя использовать в проде.
_INSECURE_SECRET = "dev-insecure-secret-change-me"
_DEFAULT_PASSWORD = "admin"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Окружение: "dev" допускает небезопасные дефолты, "prod" — нет.
    environment: str = "dev"

    # Сессия приложения
    secret_key: str = _INSECURE_SECRET
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 24

    # httpOnly cookie сессии. За HTTPS-прокси обязательно True.
    cookie_secure: bool = False

    # Единственный пользователь (self-hosted)
    app_user: str = "admin"
    app_password: str = _DEFAULT_PASSWORD

    # Шифрование учёток ящиков (Fernet). В dev при пустом значении генерируется
    # эфемерный ключ; в prod пустой ключ — фатальная ошибка старта.
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

    @property
    def is_prod(self) -> bool:
        return self.environment.lower() in ("prod", "production")

    def validate_for_production(self) -> list[str]:
        """Список фатальных проблем конфигурации для прода (пусто — всё ок)."""
        problems: list[str] = []
        if not self.is_prod:
            return problems
        if self.secret_key == _INSECURE_SECRET or len(self.secret_key) < 16:
            problems.append("SECRET_KEY не задан или слишком короткий")
        if self.app_password == _DEFAULT_PASSWORD or not self.app_password:
            problems.append("APP_PASSWORD равен дефолтному 'admin' или пуст")
        if not self.encryption_key.strip():
            problems.append("ENCRYPTION_KEY не задан (учётки нельзя надёжно шифровать)")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE=False в проде (cookie уйдёт по HTTP)")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
