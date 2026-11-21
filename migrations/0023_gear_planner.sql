CREATE TABLE IF NOT EXISTS gear_builds (
 id TEXT PRIMARY KEY,
 member TEXT NOT NULL,
 character TEXT NOT NULL COLLATE NOCASE,
 title TEXT NOT NULL,
 spec TEXT NOT NULL DEFAULT '',
 is_active INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(member,character,title)
);
CREATE INDEX IF NOT EXISTS gear_builds_member ON gear_builds(member,character);
CREATE TABLE IF NOT EXISTS gear_build_items (
 build_id TEXT NOT NULL REFERENCES gear_builds(id) ON DELETE CASCADE,
 slot TEXT NOT NULL,
 item_id INTEGER NOT NULL,
 item_name TEXT NOT NULL DEFAULT '',
 priority TEXT NOT NULL DEFAULT 'Upgrade',
 acquired INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(build_id,slot)
);
CREATE INDEX IF NOT EXISTS gear_build_items_item ON gear_build_items(item_id);
