ALTER TABLE capture_items ADD COLUMN inbox_hidden INTEGER NOT NULL DEFAULT 0 CHECK(inbox_hidden IN (0, 1));
ALTER TABLE capture_items ADD COLUMN inbox_handled INTEGER NOT NULL DEFAULT 0 CHECK(inbox_handled IN (0, 1));

UPDATE capture_items SET inbox_handled = 1 WHERE native_collection IS NOT NULL OR request_key LIKE 'web:auto-plan-%' OR EXISTS (
  SELECT 1 FROM planner_states p, json_each(p.snapshot, '$.plans') plan
  WHERE p.owner = capture_items.owner AND json_extract(plan.value, '$.inboxId') = capture_items.id
);

-- Record completed actions in the same transaction as the planner save.
CREATE TRIGGER capture_inbox_after_planner_insert AFTER INSERT ON planner_states
BEGIN
  UPDATE capture_items SET inbox_handled = 1, version = version + 1
  WHERE owner = NEW.owner AND inbox_handled = 0 AND status IN ('inbox', 'organized') AND id IN (
    SELECT json_extract(entry.value, '$.inboxId')
    FROM json_each(NEW.snapshot) section,
      json_each(CASE WHEN section.key IN ('plans', 'tasks', 'events') THEN section.value ELSE '[]' END) entry
  );
END;

CREATE TRIGGER capture_inbox_after_planner_update AFTER UPDATE OF snapshot ON planner_states
BEGIN
  UPDATE capture_items SET inbox_handled = 1, version = version + 1
  WHERE owner = NEW.owner AND inbox_handled = 0 AND status IN ('inbox', 'organized') AND id IN (
    SELECT json_extract(entry.value, '$.inboxId')
    FROM json_each(NEW.snapshot) section,
      json_each(CASE WHEN section.key IN ('plans', 'tasks', 'events') THEN section.value ELSE '[]' END) entry
  );
END;
