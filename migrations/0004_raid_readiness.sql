ALTER TABLE raid_signups ADD COLUMN readiness TEXT NOT NULL DEFAULT '{}';
ALTER TABLE raid_signups ADD COLUMN readiness_note TEXT NOT NULL DEFAULT '';
ALTER TABLE raid_signups ADD COLUMN reviewed_at TEXT;
