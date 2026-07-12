-- ============================================================
-- Migration 005: Activity Events
-- Adds a dedicated table for friend activity feed + return
-- visit support. Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add share_activity column (the app already uses it but it
--    was missing from the schema)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS share_activity BOOLEAN DEFAULT true;


-- 2. Activity events table — one row per feed-visible action
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  city TEXT,
  event_type TEXT CHECK (event_type IN ('new_memory', 'return_visit')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert own activity events"
  ON activity_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own events (needed for the client-side insert to succeed)
CREATE POLICY "Users can read own activity events"
  ON activity_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_user
  ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created
  ON activity_events(created_at DESC);


-- 3. Replace get_friend_activity to read from activity_events
--    and respect the share_activity preference
CREATE OR REPLACE FUNCTION get_friend_activity(requesting_user UUID)
RETURNS TABLE (
  restaurant_name TEXT,
  city TEXT,
  date TEXT,
  event_type TEXT,
  user_display_name TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ae.restaurant_name,
    ae.city,
    ae.created_at::date::text AS date,
    ae.event_type,
    COALESCE(p.display_name, p.first_name, 'Someone') AS user_display_name,
    ae.user_id,
    ae.created_at
  FROM activity_events ae
  JOIN profiles p ON p.id = ae.user_id
  WHERE ae.user_id IN (
    SELECT CASE
      WHEN f.requester_id = requesting_user THEN f.addressee_id
      ELSE f.requester_id
    END
    FROM friendships f
    WHERE (f.requester_id = requesting_user OR f.addressee_id = requesting_user)
      AND f.status = 'accepted'
  )
  -- Respect share_activity preference (default true if no row)
  AND NOT EXISTS (
    SELECT 1 FROM notification_preferences np
    WHERE np.user_id = ae.user_id AND np.share_activity = false
  )
  ORDER BY ae.created_at DESC
  LIMIT 50;
$$;


-- 4. Notification trigger on activity_events (replaces the old
--    memories INSERT trigger)
CREATE OR REPLACE FUNCTION notify_friends_on_activity()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true)
           || '/functions/v1/send-friend-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer '
        || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'restaurant_name', NEW.restaurant_name,
      'event_type', NEW.event_type
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_activity_insert ON activity_events;
CREATE TRIGGER on_activity_insert
  AFTER INSERT ON activity_events
  FOR EACH ROW
  EXECUTE FUNCTION notify_friends_on_activity();

-- 5. Remove old trigger on memories table (notifications now come
--    from activity_events)
DROP TRIGGER IF EXISTS on_memory_insert ON memories;
