-- Import feature prerequisites — all additive and nullable, so existing
-- app versions keep working against the updated schema.

-- Exact place identity (Foursquare) on everything place-shaped.
-- Enables exact dedupe and chain-aware visited detection instead of
-- name-string matching.
ALTER TABLE memories    ADD COLUMN IF NOT EXISTS fsq_place_id TEXT;
ALTER TABLE want_to_try ADD COLUMN IF NOT EXISTS fsq_place_id TEXT;

-- Where a memory came from ('import' initially; null = organic).
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source TEXT;

-- Every row created by an import carries its batch id, so a botched
-- import can be undone with one DELETE per table.
ALTER TABLE memories    ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE want_to_try ADD COLUMN IF NOT EXISTS import_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_memories_fsq_place ON memories(user_id, fsq_place_id);
CREATE INDEX IF NOT EXISTS idx_wtt_fsq_place      ON want_to_try(user_id, fsq_place_id);
