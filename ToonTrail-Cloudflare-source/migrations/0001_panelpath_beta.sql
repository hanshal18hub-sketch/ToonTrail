CREATE TABLE IF NOT EXISTS user_library (user_email TEXT NOT NULL, media_id INTEGER NOT NULL, title TEXT NOT NULL, cover_url TEXT, media_type TEXT, status TEXT NOT NULL DEFAULT 'PLANNING', progress INTEGER NOT NULL DEFAULT 0, chapters INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_email, media_id));
CREATE INDEX IF NOT EXISTS user_library_user_updated_idx ON user_library(user_email, updated_at DESC);
CREATE TABLE IF NOT EXISTS user_ratings (user_email TEXT NOT NULL, media_id INTEGER NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_email, media_id));
CREATE INDEX IF NOT EXISTS user_ratings_media_idx ON user_ratings(media_id);
