export const schema = {
  accounts: `CREATE TABLE IF NOT EXISTS user_accounts (
    google_sub TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    login_count INTEGER NOT NULL DEFAULT 1 CHECK(login_count > 0)
  )`,
  library: `CREATE TABLE IF NOT EXISTS user_library (
    user_email TEXT NOT NULL,
    media_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    cover_url TEXT,
    media_type TEXT,
    status TEXT NOT NULL DEFAULT 'PLANNING',
    progress INTEGER NOT NULL DEFAULT 0,
    chapters INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_email, media_id)
  )`,
  ratings: `CREATE TABLE IF NOT EXISTS user_ratings (
    user_email TEXT NOT NULL,
    media_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_email, media_id)
  )`,
};
