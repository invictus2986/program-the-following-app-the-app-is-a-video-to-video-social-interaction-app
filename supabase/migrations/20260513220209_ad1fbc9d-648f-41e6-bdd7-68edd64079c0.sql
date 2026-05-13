CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS TABLE (
  total_objects bigint,
  total_bytes bigint,
  per_user jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'view_analytics') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH objs AS (
    SELECT
      split_part(name, '/', 1) AS user_id,
      COALESCE((metadata->>'size')::bigint, 0) AS size
    FROM storage.objects
    WHERE bucket_id = 'videos'
  ),
  agg AS (
    SELECT user_id, COUNT(*)::bigint AS files, SUM(size)::bigint AS bytes
    FROM objs
    GROUP BY user_id
    ORDER BY SUM(size) DESC NULLS LAST
    LIMIT 25
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM objs),
    (SELECT COALESCE(SUM(size), 0)::bigint FROM objs),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'files', files, 'bytes', bytes)) FROM agg),
      '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storage_stats() TO authenticated;