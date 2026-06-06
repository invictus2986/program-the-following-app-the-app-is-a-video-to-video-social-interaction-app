
-- 1. Fix is_admin: only super_admin/admin roles count as admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
  );
$$;

-- 2. Hide IP columns from public/authenticated readers via column-level privileges.
--    RLS still allows row read for public, but PostgREST will refuse to project these columns.
REVOKE SELECT (signup_ip, last_ip) ON public.profiles FROM anon, authenticated;
REVOKE SELECT (posted_ip) ON public.videos FROM anon, authenticated;
REVOKE SELECT (posted_ip) ON public.replies FROM anon, authenticated;
-- service_role retains full access; admin RPCs use SECURITY DEFINER and bypass column grants.

-- 3. Tighten video_views insert to prevent spoofing another user's identity
DROP POLICY IF EXISTS "anyone insert view" ON public.video_views;
CREATE POLICY "insert own or anonymous view"
ON public.video_views
FOR INSERT TO anon, authenticated
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- 4. Revoke EXECUTE on SECURITY DEFINER helpers from anon (keep authenticated where needed)
REVOKE EXECUTE ON FUNCTION public.admin_get_user_info(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_video_info(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_user_analytics(uuid, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_platform_avg_session_seconds(timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_search_archived_videos(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_storage_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_get_user_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_video_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_analytics(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_avg_session_seconds(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_archived_videos(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_stats() TO authenticated;
