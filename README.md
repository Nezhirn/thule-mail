# ThuleMail

Быстрый, красивый, кастомизируемый веб-агрегатор почтовых ящиков (self-hosted,
один пользователь). Мультиаккаунт + объединённый входящий, стиль Apple Mail,
светлая/тёмная темы.

- **Backend:** FastAPI + IMAPClient (пул соединений на аккаунт) + SQLite-кэш +
  Fernet-шифрование учёток + JWT-сессия.
- **Frontend:** React + TypeScript + Vite + Tailwind, TanStack Query, Zustand,
  react-virtuoso, Framer Motion, Tiptap, DOMPurify.

## Возможности

- Несколько ящиков, автоопределение IMAP/SMTP по домену, проверка соединения.
- Объединённый входящий, виртуализированный список писем из локального кэша.
- Просмотр HTML-писем в изолированном sandbox-iframe с блокировкой внешних
  изображений по умолчанию; вложения; отправка (SMTP); поиск.
- Кастомизация сайдбара: порядок аккаунтов/папок (drag&drop), pin/hide, алиасы,
  цветные метки; основные папки отдельно от прочих («Другие»).

---

## Быстрый старт (Docker, рекомендуется для прода)

1. Подготовьте `.env` в корне:

   ```bash
   cp .env.example .env
   python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
   python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
   ```

   Впишите сгенерированные `SECRET_KEY`, `ENCRYPTION_KEY`, задайте `APP_PASSWORD`,
   оставьте `ENVIRONMENT=prod` и `COOKIE_SECURE=true` (для HTTPS-развёртывания).

2. Запуск:

   ```bash
   docker compose up -d --build
   ```

   Фронтенд доступен на `http://localhost:3000` (порт меняется через
   `FRONTEND_PORT`). Бэкенд наружу не публикуется — только через nginx фронта.
   SQLite-кэш хранится в именованном томе `thulemail-data`.

> **Прод за HTTPS:** ставьте `COOKIE_SECURE=true` и терминируйте TLS на внешнем
> reverse-proxy (nginx/Caddy/Traefik), проксируя на frontend-контейнер.
> Бэкенд запускается с `--proxy-headers`.

---

## Локальная разработка (без Docker)

Backend (Python 3.12+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# .env с ENVIRONMENT=dev допускает упрощённые секреты
ENVIRONMENT=dev uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000, /api проксируется на :8000
```

Тесты бэкенда:

```bash
cd backend && PYTHONPATH=. pytest -q
```

---

## Безопасность и прод-готовность

- **Fail-fast:** при `ENVIRONMENT=prod` старт падает, если `SECRET_KEY`,
  `APP_PASSWORD`, `ENCRYPTION_KEY` пустые/дефолтные или `COOKIE_SECURE=false`.
- Учётки ящиков хранятся **только зашифрованными** (Fernet, ключ из env).
- JWT — в `httpOnly`-cookie; `secure` управляется `COOKIE_SECURE`.
- HTML писем: DOMPurify + sandbox-iframe без `allow-scripts`; внешние ресурсы
  блокируются CSP до явного «Показать изображения».
- В проде закрыты `/docs`, `/redoc`, `/openapi.json`; детали ошибок не утекают
  клиенту (логируются на сервере).
- Размер тела ограничен на nginx (`client_max_body_size`).

## Переменные окружения

См. [.env.example](.env.example) — там описаны все параметры.

## Вне MVP

OAuth2 (Gmail/Outlook) и IMAP IDLE не реализованы; используется логин/пароль
(app password) и фоновый поллинг. Архитектура IMAP-слоя готова к добавлению
XOAUTH2 без переделки.
