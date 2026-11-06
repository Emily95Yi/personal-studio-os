ALTER TABLE caldav_connections ADD COLUMN secondary_name TEXT;
ALTER TABLE caldav_connections ADD COLUMN secondary_key TEXT;
ALTER TABLE caldav_connections ADD COLUMN secondary_cache_json TEXT;
ALTER TABLE caldav_connections ADD COLUMN secondary_cache_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caldav_connections ADD COLUMN secondary_cache_error INTEGER NOT NULL DEFAULT 0;

ALTER TABLE caldav_events ADD COLUMN uid TEXT;
ALTER TABLE caldav_events ADD COLUMN local_json TEXT;
ALTER TABLE caldav_events ADD COLUMN remote_json TEXT;
ALTER TABLE caldav_events ADD COLUMN operation TEXT;
