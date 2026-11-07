CREATE TABLE calendar_sources (
  owner TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  encrypted_url TEXT NOT NULL,
  events_json TEXT,
  window_start TEXT,
  window_end TEXT,
  fetched_at INTEGER,
  refresh_after INTEGER NOT NULL DEFAULT 0,
  refresh_error INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE planner_states (
  owner TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);
