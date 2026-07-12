-- ============================================================
-- Migration: Add RPC function to check username availability
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
-- This function runs with SECURITY DEFINER so it bypasses RLS,
-- allowing unauthenticated users (during signup) to check if
-- a username is already taken BEFORE creating an account.

CREATE OR REPLACE FUNCTION check_username_available(desired_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM profiles WHERE username = lower(trim(desired_username))
  );
$$;
