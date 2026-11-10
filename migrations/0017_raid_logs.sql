CREATE TABLE raid_log_links (raid_id TEXT PRIMARY KEY REFERENCES raids(id) ON DELETE CASCADE, report_code TEXT NOT NULL);
CREATE TABLE raid_log_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
