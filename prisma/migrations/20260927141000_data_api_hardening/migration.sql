-- Pin search_path on the admin guard trigger functions (Supabase lint 0011).
ALTER FUNCTION public.reject_admin_audit_mutation() SET search_path = '';
ALTER FUNCTION public.linkar_prevent_completed_stage_mutation() SET search_path = '';

-- Linkar reads and writes its tables only through Prisma's own connection and
-- uses Supabase for Auth alone, so the Data API roles need no access to
-- `public`. RLS already denies every row to them; this removes the grants
-- underneath as a second layer, including for tables created later. The roles
-- only exist on Supabase, so plain Postgres (local dev, CI) skips this.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END
$$;
