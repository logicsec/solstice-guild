ALTER TABLE raids ADD COLUMN reserve_limit INTEGER NOT NULL DEFAULT 2 CHECK (reserve_limit BETWEEN 1 AND 5);
ALTER TABLE raids ADD COLUMN reserves_locked INTEGER NOT NULL DEFAULT 0 CHECK (reserves_locked IN (0,1));

CREATE TABLE raid_reserves (
  raid_id TEXT NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  player_key TEXT NOT NULL,
  character TEXT NOT NULL,
  items TEXT NOT NULL,
  PRIMARY KEY (raid_id, player_key)
);
CREATE INDEX raid_reserves_player ON raid_reserves(player_key);
