CREATE TABLE raid_prep (
  raid_id TEXT NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  task TEXT NOT NULL,
  reported_at TEXT,
  PRIMARY KEY (raid_id, id)
);
