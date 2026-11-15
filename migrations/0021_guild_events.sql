CREATE TABLE guild_events (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Dungeon', 'Leveling', 'Other')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  description TEXT NOT NULL DEFAULT ''
);

CREATE INDEX guild_events_starts_at ON guild_events (starts_at);

CREATE TABLE guild_event_signups (
  event_id TEXT NOT NULL REFERENCES guild_events (id) ON DELETE CASCADE,
  member TEXT NOT NULL,
  PRIMARY KEY (event_id, member)
);
