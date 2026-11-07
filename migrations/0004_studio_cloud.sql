CREATE TABLE studio_cloud (
  owner TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  object_key TEXT,
  previous_key TEXT,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
