-- Persistent tied-score groups.
-- When a user taps "Too Close" during a comparison, the new memory and the
-- comparison memory are linked via tied_group_id. recalculateTierScores
-- treats every member of the same tied_group_id as a single rank slot, so
-- their scores stay equal across future redistributions.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS tied_group_id UUID;

CREATE INDEX IF NOT EXISTS memories_tied_group_id_idx
  ON public.memories(tied_group_id)
  WHERE tied_group_id IS NOT NULL;
