-- Adds the user's score weighting preference to profiles.
-- 'food_first'   → taste 50% / vibe 25% / value 25%
-- 'full_picture' → taste 40% / vibe 30% / value 30%
--
-- Existing users default to 'food_first' so their previously-computed
-- composite scores remain unchanged (the legacy formula was 50/25/25).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS score_preference TEXT NOT NULL DEFAULT 'food_first'
    CHECK (score_preference IN ('food_first', 'full_picture'));
