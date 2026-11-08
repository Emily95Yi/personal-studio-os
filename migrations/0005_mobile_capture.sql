CREATE TABLE capture_devices (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  digest TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX capture_devices_owner ON capture_devices(owner, created_at DESC);

CREATE TABLE capture_uploads (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  actor TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('opening', 'uploading', 'ready', 'deleting')),
  multipart_id TEXT,
  etag TEXT,
  checksum TEXT
);
CREATE INDEX capture_uploads_checksum ON capture_uploads(owner, checksum) WHERE checksum IS NOT NULL;
CREATE INDEX capture_uploads_cleanup ON capture_uploads(status, created_at);
CREATE TABLE capture_upload_parts (
  upload_id TEXT NOT NULL REFERENCES capture_uploads(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  digest TEXT NOT NULL,
  PRIMARY KEY(upload_id, part_number)
);

CREATE TABLE capture_items (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  device_id TEXT,
  request_key TEXT,
  type TEXT NOT NULL CHECK(type IN ('url', 'text', 'image', 'pdf', 'file')),
  source_url TEXT NOT NULL DEFAULT '',
  normalized_url TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('inbox', 'organized', 'archived', 'deleted')),
  version INTEGER NOT NULL DEFAULT 0,
  target TEXT,
  native_collection TEXT CHECK(native_collection IN ('content', 'collectionItems', 'explorationEntries')),
  document TEXT NOT NULL,
  attachment_id TEXT UNIQUE REFERENCES capture_uploads(id),
  UNIQUE(owner, request_key)
);
CREATE INDEX capture_inbox ON capture_items(owner, status, captured_at DESC, id);
CREATE UNIQUE INDEX capture_unique_url ON capture_items(owner, normalized_url)
  WHERE type = 'url' AND status != 'deleted';

CREATE TABLE capture_storage_cache (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  payload TEXT NOT NULL,
  measured_at INTEGER NOT NULL
);
