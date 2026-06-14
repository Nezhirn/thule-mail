# Фиксируем Python 3.12 — стабильные wheel'ы для cryptography/pydantic.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Системные зависимости для cryptography (на slim обычно достаточно wheel'ов,
# но оставляем gcc на случай сборки из исходников).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Непривилегированный пользователь + каталог под SQLite-кэш (монтируется volume'ом).
RUN mkdir -p /app/data \
    && useradd --system --uid 1000 --home /app thule \
    && chown -R thule:thule /app
USER thule

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status==200 else 1)"

# --proxy-headers: корректный scheme/IP за nginx. Один воркер достаточен для
# self-hosted single-user (состояние пулов/локов — внутри процесса).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
