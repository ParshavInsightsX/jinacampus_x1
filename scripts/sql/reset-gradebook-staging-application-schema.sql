-- Destructive staging-only reset. Run exclusively through scripts/gradebook-staging.ps1,
-- whose URL guard rejects the production Supabase project before this file is used.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', item.tablename);
  END LOOP;

  FOR item IN
    SELECT t.typname
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
    ORDER BY t.typname
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', item.typname);
  END LOOP;
END
$$;
