CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL
);
