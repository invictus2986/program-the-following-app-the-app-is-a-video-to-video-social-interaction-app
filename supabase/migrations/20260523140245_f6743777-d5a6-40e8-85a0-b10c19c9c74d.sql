
-- Cascade: when a video is deleted, remove all its replies
CREATE OR REPLACE FUNCTION public.cascade_delete_replies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.replies WHERE video_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_delete_replies ON public.videos;
CREATE TRIGGER trg_cascade_delete_replies
BEFORE DELETE ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.cascade_delete_replies();

-- Allow admins to delete any reply
DROP POLICY IF EXISTS "admins delete any reply" ON public.replies;
CREATE POLICY "admins delete any reply"
ON public.replies
FOR DELETE
USING (public.has_permission(auth.uid(), 'manage_users'));
