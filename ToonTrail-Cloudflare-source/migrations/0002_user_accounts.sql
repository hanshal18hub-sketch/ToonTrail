CREATE TABLE IF NOT EXISTS user_accounts (
  google_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  login_count INTEGER NOT NULL DEFAULT 1 CHECK(login_count > 0)
);
CREATE INDEX IF NOT EXISTS user_accounts_last_activity_idx ON user_accounts(last_activity_at DESC);
