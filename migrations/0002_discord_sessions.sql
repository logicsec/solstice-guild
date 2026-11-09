CREATE TABLE discord_sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX discord_sessions_expiry ON discord_sessions(expires_at);
