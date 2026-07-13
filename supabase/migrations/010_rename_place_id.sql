-- fsq_place_id now stores Google Place IDs (search migrated to Google
-- Places API, July 2026) — rename to the provider-neutral place_id.
ALTER TABLE memories    RENAME COLUMN fsq_place_id TO place_id;
ALTER TABLE want_to_try RENAME COLUMN fsq_place_id TO place_id;

ALTER INDEX IF EXISTS idx_memories_fsq_place RENAME TO idx_memories_place;
ALTER INDEX IF EXISTS idx_wtt_fsq_place      RENAME TO idx_wtt_place;
