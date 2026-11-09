CREATE TABLE raids (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size IN (10, 20, 40)),
  notes TEXT NOT NULL
);
CREATE TABLE raid_signups (
  raid_id TEXT NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  member TEXT NOT NULL,
  character TEXT NOT NULL,
  class_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  group_no INTEGER CHECK (group_no BETWEEN 1 AND 8),
  PRIMARY KEY (raid_id, member)
);
CREATE TABLE raid_characters (
  member TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  class_name TEXT NOT NULL,
  spec TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (member, name)
);
