-- "Been here" imports waiting to be rated (Library → To Rate tab).
-- Rows graduate into memories via the full Add Experience flow, then
-- are deleted. All access is owner-only.

CREATE TABLE IF NOT EXISTS import_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  source TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  place_id TEXT,
  category TEXT,
  prefill_rating DOUBLE PRECISION,
  prefill_note TEXT,
  import_batch_id UUID
);

ALTER TABLE import_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_select_own" ON import_queue FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "queue_insert_own" ON import_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "queue_delete_own" ON import_queue FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_import_queue_user ON import_queue(user_id, created_at DESC);
