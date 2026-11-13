CREATE TABLE guild_meetings (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location TEXT NOT NULL,
  agenda TEXT NOT NULL,
  notes TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX guild_meetings_starts ON guild_meetings(starts_at);

CREATE TABLE raid_loot_awards (
  id TEXT PRIMARY KEY,
  raid_id TEXT NOT NULL,
  raid_title TEXT NOT NULL,
  raid_starts_at TEXT NOT NULL,
  item TEXT NOT NULL,
  recipient TEXT NOT NULL,
  note TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX raid_loot_awards_raid ON raid_loot_awards(raid_id);
