CREATE TABLE raid_teams (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 size INTEGER NOT NULL DEFAULT 20 CHECK(size IN (10,20,40)),
 accent TEXT NOT NULL DEFAULT '#7b70ef',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE raid_team_members (
 team_id TEXT NOT NULL REFERENCES raid_teams(id) ON DELETE CASCADE,
 character_key TEXT NOT NULL,
 name TEXT NOT NULL,
 slug TEXT,
 class_name TEXT NOT NULL,
 spec TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT '',
 is_main INTEGER NOT NULL DEFAULT 1 CHECK(is_main IN (0,1)),
 added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(team_id,character_key)
);
CREATE UNIQUE INDEX raid_team_member_slug ON raid_team_members(team_id,slug) WHERE slug IS NOT NULL;
CREATE TABLE guild_roster_snapshots (
 guild_slug TEXT PRIMARY KEY,
 payload TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
