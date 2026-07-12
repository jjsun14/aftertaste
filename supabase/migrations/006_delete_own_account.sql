-- Allows an authenticated user to delete their own auth account.
-- Called via: supabase.rpc('delete_own_account')
-- Requires: SECURITY DEFINER to access auth.users (which normal users cannot).

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM auth.users WHERE id = auth.uid();
$$;

-- Only authenticated users can call this
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
