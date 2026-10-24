-- ============================================================
-- Supabase hardening: lock down the REST (PostgREST) Data API.
-- Run this in Supabase > SQL Editor AFTER `alembic upgrade head`.
--
-- Cinemor's own backend connects as the `postgres`/service role and is
-- unaffected by RLS. This only blocks the public anon/authenticated roles
-- that Supabase exposes over https://<project>.supabase.co/rest/v1/...
-- With RLS enabled and no policies, those roles get zero rows.
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Extra belt-and-braces: remove table privileges from the API roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Verify (every row should show rowsecurity = true):
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
