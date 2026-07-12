-- ============================================================
-- Migration: Allow authenticated users to read profiles
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
-- Without this policy, searchByUsername and findByFriendCode
-- silently return empty results because RLS blocks reading
-- other users' profiles.

-- Allow any authenticated user to SELECT from profiles
-- (needed for friend search by username / friend_code)
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
