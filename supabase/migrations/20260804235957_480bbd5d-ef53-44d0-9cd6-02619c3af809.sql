-- Column-level privileges are required here: RLS does not restrict which
-- columns a role can read, so a table-wide GRANT SELECT exposes IP columns.
-- A column-level REVOKE is a no-op while a table-level grant exists, so the
-- table-level grant must be dropped first and re-granted per column.

-- ============ profiles (signup_ip, last_ip) ============
REVOKE ALL ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, user_id, username, display_name, avatar_url, bio,
  created_at, updated_at, deleted_at
) ON public.profiles TO anon, authenticated;

GRANT INSERT (
  id, user_id, username, display_name, avatar_url, bio,
  created_at, updated_at, deleted_at
) ON public.profiles TO authenticated;

GRANT UPDATE (
  username, display_name, avatar_url, bio, updated_at, deleted_at
) ON public.profiles TO authenticated;

-- ============ videos (posted_ip) ============
REVOKE ALL ON public.videos FROM anon, authenticated;

GRANT SELECT (
  id, user_id, storage_path, thumbnail_url, caption, hashtags,
  duration_seconds, views_count, likes_count, replies_count,
  reach_target, created_at, deleted_at
) ON public.videos TO anon, authenticated;

GRANT INSERT (
  id, user_id, storage_path, thumbnail_url, caption, hashtags,
  duration_seconds, views_count, likes_count, replies_count,
  reach_target, created_at, deleted_at
) ON public.videos TO authenticated;

GRANT UPDATE (
  storage_path, thumbnail_url, caption, hashtags, duration_seconds,
  views_count, likes_count, replies_count, reach_target, deleted_at
) ON public.videos TO authenticated;

-- bump_views()/bump_likes()/bump_replies() are SECURITY INVOKER triggers that
-- increment counters, including for signed-out viewers, so anon needs UPDATE
-- on the counter columns only.
GRANT UPDATE (views_count, likes_count, replies_count, reach_target)
  ON public.videos TO anon;

GRANT DELETE ON public.videos TO authenticated;

-- ============ replies (posted_ip) ============
REVOKE ALL ON public.replies FROM anon, authenticated;

GRANT SELECT (
  id, video_id, user_id, storage_path, duration_seconds,
  created_at, parent_reply_id
) ON public.replies TO anon, authenticated;

GRANT INSERT (
  id, video_id, user_id, storage_path, duration_seconds,
  created_at, parent_reply_id
) ON public.replies TO authenticated;

GRANT DELETE ON public.replies TO authenticated;

-- Privileged paths keep full access: admin lookups use SECURITY DEFINER
-- functions and server code uses service_role.
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.videos   TO service_role;
GRANT ALL ON public.replies  TO service_role;