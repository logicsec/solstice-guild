ALTER TABLE guild_events ADD COLUMN creator_name TEXT;
ALTER TABLE raids ADD COLUMN creator_name TEXT;

CREATE INDEX discord_sessions_member_expiry ON discord_sessions (discord_id, expires_at DESC);

UPDATE guild_events SET creator_name = (
  SELECT display_name FROM discord_sessions WHERE discord_id = guild_events.owner ORDER BY expires_at DESC LIMIT 1
);

UPDATE raids SET creator_name = (
  SELECT display_name FROM discord_sessions WHERE discord_id = raids.owner ORDER BY expires_at DESC LIMIT 1
);
