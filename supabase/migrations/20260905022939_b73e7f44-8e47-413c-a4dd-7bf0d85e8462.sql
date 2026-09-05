CREATE OR REPLACE FUNCTION public.bump_replies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if tg_op = 'INSERT' then
    update public.videos set replies_count = replies_count + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    -- While a video is being deleted, its own counter must not be touched:
    -- the row is disappearing and the promoted conversations are recounted.
    if coalesce(current_setting('jaiff.deleting_video', true), '') = '1' then
      return old;
    end if;
    update public.videos set replies_count = greatest(replies_count - 1, 0) where id = old.video_id;
    return old;
  end if;
  return null;
end; $$;

CREATE OR REPLACE FUNCTION public.promote_replies_on_video_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  orphan uuid;
  guard int := 0;
BEGIN
  PERFORM set_config('jaiff.deleting_video', '1', true);

  -- Direct replies whose owner no longer exists (e.g. account deletion cascade)
  -- cannot become videos; delete them so their own children move up one level.
  LOOP
    guard := guard + 1;
    EXIT WHEN guard > 1000;
    SELECT id INTO orphan
      FROM public.replies rr
     WHERE rr.video_id = OLD.id
       AND rr.parent_reply_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = rr.user_id)
     LIMIT 1;
    EXIT WHEN orphan IS NULL;
    DELETE FROM public.replies WHERE id = orphan;
    orphan := NULL;
  END LOOP;

  FOR r IN
    SELECT * FROM public.replies
     WHERE video_id = OLD.id AND parent_reply_id IS NULL
  LOOP
    -- Promote the reply itself, keeping its identifier and its owner.
    INSERT INTO public.videos (
      id, user_id, storage_path, caption, hashtags, duration_seconds,
      created_at, posted_ip, promoted_from_deleted_parent, promoted_at
    )
    VALUES (
      r.id, r.user_id, r.storage_path, NULL, '{}'::text[], r.duration_seconds,
      r.created_at, r.posted_ip, true, now()
    );

    -- Re-root its whole subtree (and itself) under the new top-level video.
    WITH RECURSIVE subtree AS (
      SELECT id FROM public.replies WHERE id = r.id
      UNION ALL
      SELECT c.id FROM public.replies c JOIN subtree s ON c.parent_reply_id = s.id
    )
    UPDATE public.replies
       SET video_id = r.id
     WHERE id IN (SELECT id FROM subtree);

    -- Its direct children stay attached to it, now as top-level replies.
    UPDATE public.replies
       SET parent_reply_id = NULL
     WHERE parent_reply_id = r.id;

    -- Remove the reply row (it has no children left, so nothing moves).
    DELETE FROM public.replies WHERE id = r.id;

    -- Keep counters truthful for the new conversation origin.
    UPDATE public.videos v
       SET replies_count = (SELECT count(*) FROM public.replies x WHERE x.video_id = v.id)
     WHERE v.id = r.id;
  END LOOP;

  PERFORM set_config('jaiff.deleting_video', '', true);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_replies_on_video_delete() FROM PUBLIC, anon, authenticated;