CREATE TABLE character_journey (
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  PRIMARY KEY (slug, day),
  FOREIGN KEY (slug) REFERENCES armory_links(slug) ON DELETE CASCADE
);
