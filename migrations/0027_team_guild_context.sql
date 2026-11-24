ALTER TABLE raid_teams ADD COLUMN region TEXT NOT NULL DEFAULT 'us' CHECK(region IN ('us','eu','kr','tw'));
ALTER TABLE raid_teams ADD COLUMN ruleset INTEGER NOT NULL DEFAULT 2 CHECK(ruleset IN (1,2,3,15));
ALTER TABLE raid_teams ADD COLUMN guild_slug TEXT DEFAULT 'solstice';
ALTER TABLE raid_teams ADD COLUMN guild_name TEXT DEFAULT 'Solstice';
ALTER TABLE raid_teams ADD COLUMN default_role TEXT NOT NULL DEFAULT 'Raider' CHECK(default_role IN ('Viewer','Raider','Editor','Officer'));
ALTER TABLE raid_teams ADD COLUMN permissions_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(permissions_confirmed IN (0,1));
CREATE TABLE raid_team_people (
 team_id TEXT NOT NULL REFERENCES raid_teams(id) ON DELETE CASCADE,
 member TEXT NOT NULL,
 access_role TEXT NOT NULL DEFAULT 'Raider' CHECK(access_role IN ('Viewer','Raider','Editor','Officer')),
 joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(team_id,member)
);
CREATE TABLE raid_team_schedules (
 id TEXT PRIMARY KEY,
 team_id TEXT NOT NULL REFERENCES raid_teams(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('Progress','Farm','Optional','Off night')),
 instance TEXT,
 timezone TEXT NOT NULL,
 days TEXT NOT NULL,
 owner TEXT NOT NULL,
 creator_name TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(team_id,kind)
);
CREATE INDEX raid_schedule_lookup ON raids(json_extract(settings,'$.teamSchedule.id'),starts_at);
