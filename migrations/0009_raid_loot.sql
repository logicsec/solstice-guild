ALTER TABLE raids ADD COLUMN instance TEXT;

CREATE TABLE raid_loot_tables (
  owner TEXT NOT NULL,
  instance TEXT NOT NULL,
  items TEXT NOT NULL,
  PRIMARY KEY (owner, instance)
);
