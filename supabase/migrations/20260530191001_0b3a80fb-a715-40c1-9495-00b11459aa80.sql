
-- Restore Data API grants for all public tables.
-- Authenticated users get full CRUD (RLS still enforces row-level rules).
-- Anonymous users get SELECT only on tables with permissive read policies.
-- service_role gets ALL on every table.

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END;
$$;

-- Anonymous read access for tables with permissive public-read policies.
GRANT SELECT ON public.videos TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.replies TO anon;
GRANT SELECT ON public.follows TO anon;
GRANT SELECT ON public.video_views TO anon;
GRANT SELECT ON public.announcements TO anon;
GRANT INSERT ON public.video_views TO anon;
