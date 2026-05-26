
CREATE OR REPLACE FUNCTION public.admin_search_archived_videos(_email_query text DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  storage_path text,
  caption text,
  duration_seconds integer,
  views_count integer,
  likes_count integer,
  replies_count integer,
  created_at timestamptz,
  deleted_at timestamptz,
  posted_ip inet,
  owner_email text,
  owner_username text,
  owner_display_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_users') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT v.id, v.user_id, v.storage_path, v.caption, v.duration_seconds,
         v.views_count, v.likes_count, v.replies_count, v.created_at, v.deleted_at,
         v.posted_ip, u.email::text, p.username, p.display_name
  FROM public.videos v
  LEFT JOIN auth.users u ON u.id = v.user_id
  LEFT JOIN public.profiles p ON p.user_id = v.user_id
  WHERE v.deleted_at IS NOT NULL
    AND (
      _email_query IS NULL
      OR _email_query = ''
      OR u.email ILIKE '%' || _email_query || '%'
      OR p.username ILIKE '%' || _email_query || '%'
    )
  ORDER BY v.deleted_at DESC
  LIMIT 200;
END;
$$;
