CREATE TABLE caldav_setup (
  owner TEXT PRIMARY KEY,
  sealed TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE caldav_connections (
  owner TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  collection_key TEXT NOT NULL,
  sealed TEXT NOT NULL,
  cache_json TEXT,
  cache_at INTEGER NOT NULL DEFAULT 0,
  cache_error INTEGER NOT NULL DEFAULT 0,
  refresh_after INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE caldav_events (
  owner TEXT NOT NULL,
  event_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  state TEXT NOT NULL,
  reason TEXT,
  href TEXT,
  etag TEXT,
  conflicts_json TEXT,
  updated_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, event_id)
);

CREATE INDEX caldav_events_queue ON caldav_events (owner, connection_id, state, updated_at);
