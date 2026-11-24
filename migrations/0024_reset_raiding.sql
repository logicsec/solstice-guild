-- User-requested Raiding reset. Applied once by the migration runner.
-- Keep guild characters, Armory links, Gear Planner builds and non-raid events.
DELETE FROM raid_signups;
DELETE FROM raid_prep;
DELETE FROM raid_reserves;
DELETE FROM raid_log_links;
DELETE FROM raid_log_cache;
DELETE FROM raid_loot_awards;
DELETE FROM raid_loot_tables;
DELETE FROM raids;
