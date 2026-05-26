
-- Moderation log table
CREATE TABLE public.moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  target_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_log_created_at_idx ON public.moderation_log (created_at DESC);
CREATE INDEX moderation_log_action_idx ON public.moderation_log (action);

GRANT SELECT ON public.moderation_log TO authenticated;
GRANT ALL ON public.moderation_log TO service_role;

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read moderation log"
ON public.moderation_log FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'view_reports'));

-- ============ Triggers ============

-- Videos: log archive (soft-delete) and permanent delete
CREATE OR REPLACE FUNCTION public.log_video_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_username text;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    SELECT u.email::text, p.username INTO v_email, v_username
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.id = NEW.user_id;
    INSERT INTO public.moderation_log (actor_id, action, target_type, target_id, target_label, details)
    VALUES (
      auth.uid(), 'video_archived', 'video', NEW.id,
      COALESCE(v_email, v_username, NEW.user_id::text),
      jsonb_build_object('owner_id', NEW.user_id, 'owner_email', v_email, 'owner_username', v_username, 'caption', NEW.caption)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_video_archive
AFTER UPDATE ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.log_video_archive();

CREATE OR REPLACE FUNCTION public.log_video_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_username text;
  v_actor uuid := auth.uid();
BEGIN
  SELECT u.email::text, p.username INTO v_email, v_username
  FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = OLD.user_id;
  -- Skip when the owner deletes their own video (not a moderation action).
  IF v_actor IS NOT NULL AND v_actor <> OLD.user_id THEN
    INSERT INTO public.moderation_log (actor_id, action, target_type, target_id, target_label, details)
    VALUES (
      v_actor, 'video_deleted', 'video', OLD.id,
      COALESCE(v_email, v_username, OLD.user_id::text),
      jsonb_build_object('owner_id', OLD.user_id, 'owner_email', v_email, 'owner_username', v_username, 'caption', OLD.caption, 'was_archived', OLD.deleted_at IS NOT NULL)
    );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_video_delete
BEFORE DELETE ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.log_video_delete();

-- Announcements: log post and snapshot on delete (the log row becomes the archive)
CREATE OR REPLACE FUNCTION public.log_announcement_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.moderation_log (actor_id, action, target_type, target_id, target_label, details)
  VALUES (
    NEW.created_by, 'announcement_posted', 'announcement', NEW.id,
    NEW.title,
    jsonb_build_object('title', NEW.title, 'body', NEW.body, 'pinned', NEW.pinned)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_announcement_post
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.log_announcement_post();

CREATE OR REPLACE FUNCTION public.log_announcement_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.moderation_log (actor_id, action, target_type, target_id, target_label, details)
  VALUES (
    auth.uid(), 'announcement_deleted', 'announcement', OLD.id,
    OLD.title,
    jsonb_build_object(
      'title', OLD.title, 'body', OLD.body, 'pinned', OLD.pinned,
      'created_by', OLD.created_by, 'created_at', OLD.created_at,
      'video_storage_path', OLD.video_storage_path, 'video_thumbnail_url', OLD.video_thumbnail_url
    )
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_announcement_delete
BEFORE DELETE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.log_announcement_delete();

-- Profiles: log account deletion (soft-delete via deleted_at)
CREATE OR REPLACE FUNCTION public.log_account_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    SELECT email::text INTO v_email FROM auth.users WHERE id = NEW.user_id;
    INSERT INTO public.moderation_log (actor_id, action, target_type, target_id, target_label, details)
    VALUES (
      auth.uid(), 'account_deleted', 'user', NEW.user_id,
      COALESCE(v_email, NEW.username),
      jsonb_build_object('username', NEW.username, 'display_name', NEW.display_name, 'email', v_email)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_account_delete
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_account_delete();
