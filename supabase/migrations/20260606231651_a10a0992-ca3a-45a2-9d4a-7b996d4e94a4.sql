
-- Re-grant helpers used inside RLS policies (must be executable by the calling role)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;

-- Lock down trigger functions (only invoked by triggers, never by user RPC)
REVOKE EXECUTE ON FUNCTION public.bump_views() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.bump_likes() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.bump_replies() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_like_notification() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_reply() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_like() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_user_report_priority() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_video_report_priority() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_announcement_post() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_announcement_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_account_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_video_archive() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_video_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cascade_delete_replies() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
