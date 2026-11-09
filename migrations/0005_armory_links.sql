CREATE TABLE armory_links (
  slug TEXT PRIMARY KEY,
  member TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL
);
CREATE INDEX armory_links_member ON armory_links(member);
