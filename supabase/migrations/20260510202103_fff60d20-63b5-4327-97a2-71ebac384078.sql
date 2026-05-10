
-- =========================
-- SOFT DELETES
-- =========================
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_videos_deleted_at ON public.videos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at);

-- Replace public read policies to filter out soft-deleted rows
DROP POLICY IF EXISTS "videos public read" ON public.videos;
CREATE POLICY "videos public read"
ON public.videos FOR SELECT
USING (
  deleted_at IS NULL
  OR auth.uid() = user_id
  OR has_permission(auth.uid(), 'manage_users')
);

DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
CREATE POLICY "profiles public read"
ON public.profiles FOR SELECT
USING (
  deleted_at IS NULL
  OR auth.uid() = user_id
  OR has_permission(auth.uid(), 'manage_users')
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,           -- recipient
  actor_id uuid NOT NULL,          -- who triggered it
  type text NOT NULL CHECK (type IN ('like_video','reply_to_video','like_reply')),
  video_id uuid,
  reply_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- No INSERT policy: only triggers (SECURITY DEFINER) can insert.

-- =========================
-- TRIGGER FUNCTIONS
-- =========================
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.videos WHERE id = NEW.video_id;
  IF v_owner IS NOT NULL AND v_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, video_id)
    VALUES (v_owner, NEW.user_id, 'like_video', NEW.video_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.videos WHERE id = NEW.video_id;
  IF v_owner IS NOT NULL AND v_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, video_id, reply_id)
    VALUES (v_owner, NEW.user_id, 'reply_to_video', NEW.video_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_like_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE type = 'like_video'
    AND video_id = OLD.video_id
    AND actor_id = OLD.user_id;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_on_like ON public.likes;
CREATE TRIGGER trg_notify_on_like
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

DROP TRIGGER IF EXISTS trg_cleanup_like_notification ON public.likes;
CREATE TRIGGER trg_cleanup_like_notification
AFTER DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.cleanup_like_notification();

DROP TRIGGER IF EXISTS trg_notify_on_reply ON public.replies;
CREATE TRIGGER trg_notify_on_reply
AFTER INSERT ON public.replies
FOR EACH ROW EXECUTE FUNCTION public.notify_on_reply();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
