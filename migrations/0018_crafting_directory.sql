CREATE TABLE guild_crafts (
  member TEXT NOT NULL,
  character TEXT NOT NULL COLLATE NOCASE,
  profession TEXT NOT NULL,
  spell_id INTEGER NOT NULL,
  recipe_name TEXT NOT NULL,
  result_name TEXT NOT NULL,
  materials TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (member, character, profession, spell_id)
);
