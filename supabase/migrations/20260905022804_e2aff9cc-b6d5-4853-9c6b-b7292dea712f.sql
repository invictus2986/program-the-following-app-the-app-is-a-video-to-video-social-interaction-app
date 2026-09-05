-- 1. Metadata so the UI can warn about detached conversations.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS promoted_from_deleted_parent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

ALTER TABLE public.replies
  ADD COLUMN IF NOT EXISTS parent_deleted boolean NOT NULL DEFAULT false;

-- 2. Never cascade-delete descendants through the reply parent link.
ALTER TABLE public.replies DROP CONSTRAINT IF EXISTS replies_parent_reply_id_fkey;
ALTER TABLE public.replies
  ADD CONSTRAINT replies_parent_reply_id_fkey
  FOREIGN KEY (parent_reply_id) REFERENCES public.replies(id) ON DELETE SET NULL;

-- 3. Drop the old "delete all replies with the video" behaviour.
DROP TRIGGER IF EXISTS trg_cascade_delete_replies ON public.videos;
DROP FUNCTION IF EXISTS public.cascade_delete_replies();

-- 4. Deleting a reply reparents ONLY its direct children, one level up.
CREATE OR REPLACE FUNCTION public.reparent_reply_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.replies
     SET parent_reply_id = OLD.parent_reply_id,
         parent_deleted = true
   WHERE parent_reply_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparent_reply_children ON public.replies;
CREATE TRIGGER trg_reparent_reply_children
BEFORE DELETE ON public.replies
FOR EACH ROW EXECUTE FUNCTION public.reparent_reply_children();

-- 5. Deleting an original video promotes its direct replies to top-level videos.
--    The reply row is MOVED (same id, same owner) into videos - never duplicated.
CREATE OR REPLACE FUNCTION public.promote_replies_on_video_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  guard int := 0;
BEGIN
  -- Direct replies whose owner no longer exists (e.g. account deletion cascade)
  -- cannot become videos; delete them so their own children move up one level.
  LOOP
    guard := guard + 1;
    EXIT WHEN guard > 1000;
    SELECT id INTO r
      FROM public.replies
     WHERE video_id = OLD.id
       AND parent_reply_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = replies.user_id)
     LIMIT 1;
    EXIT WHEN r IS NULL;
    DELETE FROM public.replies WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT * FROM public.replies
     WHERE video_id = OLD.id AND parent_reply_id IS NULL
  LOOP
    -- 5a. Promote the reply itself, keeping its identifier and its owner.
    INSERT INTO public.videos (
      id, user_id, storage_path, caption, hashtags, duration_seconds,
      created_at, posted_ip, promoted_from_deleted_parent, promoted_at
    )
    VALUES (
      r.id, r.user_id, r.storage_path, NULL, '{}'::text[], r.duration_seconds,
      r.created_at, r.posted_ip, true, now()
    );

    -- 5b. Re-root its whole subtree under the new top-level video.
    WITH RECURSIVE subtree AS (
      SELECT id FROM public.replies WHERE parent_reply_id = r.id
      UNION ALL
      SELECT c.id FROM public.replies c JOIN subtree s ON c.parent_reply_id = s.id
    )
    UPDATE public.replies
       SET video_id = r.id
     WHERE id IN (SELECT id FROM subtree);

    -- 5c. Its direct children stay attached to it, now as top-level replies.
    UPDATE public.replies
       SET parent_reply_id = NULL
     WHERE parent_reply_id = r.id;

    -- 5d. Remove the reply row (it has no children left, so nothing moves).
    DELETE FROM public.replies WHERE id = r.id;

    -- 5e. Keep counters truthful for the new conversation origin.
    UPDATE public.videos v
       SET replies_count = (SELECT count(*) FROM public.replies x WHERE x.video_id = v.id)
     WHERE v.id = r.id;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_replies_on_video_delete ON public.videos;
CREATE TRIGGER trg_promote_replies_on_video_delete
BEFORE DELETE ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.promote_replies_on_video_delete();