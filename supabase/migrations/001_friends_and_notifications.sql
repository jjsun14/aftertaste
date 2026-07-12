-- ============================================================
-- Migration: Friends & Notifications
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add username and friend_code to profiles
-- ─────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_code TEXT UNIQUE
  DEFAULT substring(gen_random_uuid()::text, 1, 8);

-- Backfill friend_code for existing profiles that don't have one
UPDATE profiles
SET friend_code = substring(gen_random_uuid()::text, 1, 8)
WHERE friend_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON profiles(friend_code);


-- 2. Friendships table
-- ─────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can create friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Addressee can update status"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

CREATE POLICY "Either party can delete"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);


-- 3. Push tokens table
-- ─────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id);


-- 4. Notification preferences table
-- ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  friend_activity BOOLEAN DEFAULT true,
  friend_requests BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences"
  ON notification_preferences FOR ALL
  USING (auth.uid() = user_id);


-- 5. Friend activity RPC function
-- Returns ONLY restaurant_name, city, date for friends — never scores, notes, or photos
-- ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_friend_activity(requesting_user UUID)
RETURNS TABLE (
  restaurant_name TEXT,
  city TEXT,
  date TEXT,
  user_display_name TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    m.restaurant_name,
    m.city,
    m.date,
    COALESCE(p.display_name, p.first_name, 'Someone') AS user_display_name,
    m.user_id,
    m.created_at
  FROM memories m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.user_id IN (
    -- Get accepted friends of requesting_user
    SELECT CASE
      WHEN f.requester_id = requesting_user THEN f.addressee_id
      ELSE f.requester_id
    END
    FROM friendships f
    WHERE (f.requester_id = requesting_user OR f.addressee_id = requesting_user)
      AND f.status = 'accepted'
  )
  ORDER BY m.created_at DESC
  LIMIT 50;
$$;
