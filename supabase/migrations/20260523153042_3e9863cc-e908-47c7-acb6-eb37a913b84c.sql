
-- Per-user activity analytics, admin gated
CREATE OR REPLACE FUNCTION public.admin_user_analytics(_user_id uuid, _since timestamptz)
RETURNS TABLE(
  videos_viewed bigint,
  unique_videos_viewed bigint,
  sessions bigint,
  total_seconds bigint,
  videos_liked bigint,
  videos_replied bigint,
  videos_posted bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'view_analytics') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH v AS (
    SELECT created_at, video_id,
      LAG(created_at) OVER (ORDER BY created_at) AS prev
    FROM public.video_views
    WHERE user_id = _user_id AND created_at >= _since
  ),
  marked AS (
    SELECT created_at, video_id,
      CASE WHEN prev IS NULL OR (created_at - prev) > interval '30 minutes' THEN 1 ELSE 0 END AS new_session
    FROM v
  ),
  grouped AS (
    SELECT created_at, video_id, SUM(new_session) OVER (ORDER BY created_at) AS session_id
    FROM marked
  ),
  sess AS (
    SELECT session_id,
      EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS dur,
      COUNT(*) AS views
    FROM grouped GROUP BY session_id
  )
  SELECT
    (SELECT COUNT(*) FROM v)::bigint,
    (SELECT COUNT(DISTINCT video_id) FROM v)::bigint,
    COALESCE((SELECT COUNT(*) FROM sess), 0)::bigint,
    COALESCE((SELECT SUM(GREATEST(dur, 30))::bigint FROM sess), 0)::bigint,
    (SELECT COUNT(*) FROM public.likes WHERE user_id = _user_id AND created_at >= _since)::bigint,
    (SELECT COUNT(*) FROM public.replies WHERE user_id = _user_id AND created_at >= _since)::bigint,
    (SELECT COUNT(*) FROM public.videos WHERE user_id = _user_id AND created_at >= _since)::bigint;
END;
$$;

-- Platform-wide average seconds per active user
CREATE OR REPLACE FUNCTION public.admin_platform_avg_session_seconds(_since timestamptz)
RETURNS TABLE(active_users bigint, avg_seconds_per_user numeric, total_seconds bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'view_analytics') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH v AS (
    SELECT user_id, created_at,
      LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at) AS prev
    FROM public.video_views
    WHERE user_id IS NOT NULL AND created_at >= _since
  ),
  marked AS (
    SELECT user_id, created_at,
      CASE WHEN prev IS NULL OR (created_at - prev) > interval '30 minutes' THEN 1 ELSE 0 END AS new_session
    FROM v
  ),
  grouped AS (
    SELECT user_id, created_at,
      SUM(new_session) OVER (PARTITION BY user_id ORDER BY created_at) AS session_id
    FROM marked
  ),
  sess AS (
    SELECT user_id, session_id,
      EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS dur
    FROM grouped GROUP BY user_id, session_id
  ),
  per_user AS (
    SELECT user_id, SUM(GREATEST(dur, 30))::bigint AS total
    FROM sess GROUP BY user_id
  )
  SELECT
    COUNT(*)::bigint,
    COALESCE(AVG(total), 0)::numeric,
    COALESCE(SUM(total), 0)::bigint
  FROM per_user;
END;
$$;
