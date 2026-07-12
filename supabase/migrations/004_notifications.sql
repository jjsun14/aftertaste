-- ============================================================
-- Migration 004: Push Notifications Infrastructure
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Push tokens table — stores Expo push tokens per device
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id);

-- 2. Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  friend_activity BOOLEAN DEFAULT true,
  friend_requests BOOLEAN DEFAULT true,
  share_activity BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notification preferences"
  ON notification_preferences FOR ALL
  USING (auth.uid() = user_id);

-- 3. Enable the pg_net extension (needed for calling Edge Functions from triggers)
-- NOTE: This may already be enabled. If you get an error, that's OK.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4. Trigger function — calls the Edge Function when a memory is inserted
-- IMPORTANT: Replace <YOUR_SUPABASE_URL> and <YOUR_SERVICE_ROLE_KEY> below!
CREATE OR REPLACE FUNCTION notify_friends_on_memory()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-friend-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'restaurant_name', NEW.restaurant_name,
      'composite_score', NEW.composite_score
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create the trigger on the memories table
DROP TRIGGER IF EXISTS on_memory_insert ON memories;
CREATE TRIGGER on_memory_insert
  AFTER INSERT ON memories
  FOR EACH ROW
  EXECUTE FUNCTION notify_friends_on_memory();

-- ============================================================
-- MANUAL STEP REQUIRED:
-- Set the app settings in your Supabase project so the trigger
-- can call the Edge Function. Run these in the SQL editor with
-- your actual values:
--
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://wowhufbfgvnbnhunquiq.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';
--
-- Then deploy the Edge Function:
--   supabase functions deploy send-friend-notification
-- ============================================================
