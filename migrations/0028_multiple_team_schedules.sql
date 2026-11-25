CREATE TABLE raid_team_schedules_next (
 id TEXT PRIMARY KEY,
 team_id TEXT NOT NULL REFERENCES raid_teams(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('Progress','Farm','Optional','Off night')),
 instance TEXT,
 timezone TEXT NOT NULL,
 days TEXT NOT NULL,
 owner TEXT NOT NULL,
 creator_name TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO raid_team_schedules_next (id,team_id,kind,instance,timezone,days,owner,creator_name,created_at)
SELECT id,team_id,kind,instance,timezone,
 (SELECT json_group_array(json(day)) FROM (
  SELECT json_object('day',json_extract(value,'$.day'),'start',json_extract(value,'$.start'),'end',json_extract(value,'$.end')) AS day
  FROM json_each(s.days) ORDER BY json_extract(value,'$.day')
 )),
 owner,creator_name,created_at FROM raid_team_schedules AS s;
DROP TABLE raid_team_schedules;
ALTER TABLE raid_team_schedules_next RENAME TO raid_team_schedules;
CREATE UNIQUE INDEX raid_team_schedule_definition
 ON raid_team_schedules(team_id,kind,coalesce(instance,''),timezone,days);
