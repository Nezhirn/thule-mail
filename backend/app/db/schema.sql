-- Схема локального хранилища ThuleMail (SQLite).
-- Применяется идемпотентно при старте приложения.

-- Почтовые ящики. Учётки (пароли) хранятся ТОЛЬКО зашифрованными (Fernet).
CREATE TABLE IF NOT EXISTS accounts (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    email              TEXT    NOT NULL,
    display_name       TEXT    NOT NULL DEFAULT '',
    color              TEXT    NOT NULL DEFAULT '#3b82f6',  -- цветная метка аккаунта
    imap_host          TEXT    NOT NULL,
    imap_port          INTEGER NOT NULL DEFAULT 993,
    imap_security      TEXT    NOT NULL DEFAULT 'SSL',       -- SSL | STARTTLS | NONE
    smtp_host          TEXT    NOT NULL,
    smtp_port          INTEGER NOT NULL DEFAULT 465,
    smtp_security      TEXT    NOT NULL DEFAULT 'SSL',       -- SSL | STARTTLS | NONE
    username           TEXT    NOT NULL,                     -- логин IMAP/SMTP
    password_enc       TEXT    NOT NULL,                     -- Fernet-шифр пароля
    enabled            INTEGER NOT NULL DEFAULT 1,           -- выключенный не синхронизируется
    pool_size          INTEGER NOT NULL DEFAULT 3,
    sync_interval_sec  INTEGER NOT NULL DEFAULT 60,
    page_size          INTEGER NOT NULL DEFAULT 50,
    sort_order         INTEGER NOT NULL DEFAULT 0,           -- порядок в сайдбаре (drag&drop)
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Кэш метаданных писем (заголовки/конверты, без тел!).
CREATE TABLE IF NOT EXISTS messages_cache (
    account_id      INTEGER NOT NULL,
    folder          TEXT    NOT NULL,            -- имя папки на сервере
    uid             INTEGER NOT NULL,
    uidvalidity     INTEGER NOT NULL,
    envelope_json   TEXT    NOT NULL,            -- from/to/subject/date/message_id и т.п.
    flags           TEXT    NOT NULL DEFAULT '', -- '\\Seen \\Flagged ...' через пробел
    internaldate    TEXT,                        -- ISO-8601 для сортировки
    snippet         TEXT    NOT NULL DEFAULT '',
    has_attachments INTEGER NOT NULL DEFAULT 0,
    size            INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, folder, uid),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msgcache_listing
    ON messages_cache(account_id, folder, internaldate DESC);

-- Состояние инкрементальной синхронизации на каждую папку.
CREATE TABLE IF NOT EXISTS sync_state (
    account_id    INTEGER NOT NULL,
    folder        TEXT    NOT NULL,
    uidvalidity   INTEGER NOT NULL DEFAULT 0,
    last_uid      INTEGER NOT NULL DEFAULT 0,   -- наибольший засинхроненный UID
    last_sync_at  TEXT,
    PRIMARY KEY (account_id, folder),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Слой кастомизации папок: порядок, закрепление, скрытие, алиасы.
CREATE TABLE IF NOT EXISTS folder_layout (
    account_id   INTEGER NOT NULL,
    folder       TEXT    NOT NULL,            -- имя на сервере (ключ)
    alias        TEXT,                        -- отображаемое имя (≠ серверного)
    sort_order   INTEGER NOT NULL DEFAULT 0,
    pinned       INTEGER NOT NULL DEFAULT 0,
    hidden       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, folder),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
