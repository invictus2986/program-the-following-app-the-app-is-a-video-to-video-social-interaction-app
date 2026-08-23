-- =====================================================================
-- JAIFF — CONSOLIDATED SCHEMA (final state)
-- Generated from all 22 files in supabase/migrations/ applied in order,
-- then validated against the live database catalog.
--
-- Target: a COMPLETELY EMPTY, NEW Supabase project.
-- Run once, as a single script, in the SQL Editor (postgres role).
-- Contains NO user data and NO auth users.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  signup_ip inet,
  last_ip inet
);

CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  thumbnail_url text,
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  duration_seconds int,
  views_count int NOT NULL DEFAULT 0,
  likes_count int NOT NULL DEFAULT 0,
  replies_count int NOT NULL DEFAULT 0,
  reach_target int NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  posted_ip inet
);

CREATE TABLE IF NOT EXISTS public.replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  duration_seconds int,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_ip inet,
  parent_reply_id uuid REFERENCES public.replies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS public.video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.video_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  priority integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  priority integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  pinned boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  video_storage_path text,
  video_thumbnail_url text,
  video_duration_seconds integer
);

CREATE TABLE IF NOT EXISTS public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  banned_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,            -- recipient
  actor_id uuid NOT NULL,           -- who triggered it
  type text NOT NULL CHECK (type IN ('like_video','reply_to_video','like_reply')),
  video_id uuid,
  reply_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- NOTE: this CHECK matches the current production database exactly.
-- notify_on_reply() also emits type 'reply_to_reply' (added later), which the
-- CHECK rejects. If you want reply-to-reply notifications to work in the new
-- project, run this one line after the script:
--   ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check,
--     ADD CONSTRAINT notifications_type_check CHECK (type IN
--     ('like_video','reply_to_video','like_reply','reply_to_reply'));

CREATE TABLE IF NOT EXISTS public.moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  target_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS videos_hashtags_idx ON public.videos USING gin(hashtags);
CREATE INDEX IF NOT EXISTS videos_user_idx ON public.videos(user_id);
CREATE INDEX IF NOT EXISTS videos_created_idx ON public.videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_deleted_at ON public.videos(deleted_at);

CREATE INDEX IF NOT EXISTS replies_video_idx ON public.replies(video_id);
CREATE INDEX IF NOT EXISTS replies_video_id_idx ON public.replies(video_id);
CREATE INDEX IF NOT EXISTS replies_user_idx ON public.replies(user_id);
CREATE INDEX IF NOT EXISTS replies_parent_reply_id_idx ON public.replies(parent_reply_id);

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at);
CREATE INDEX IF NOT EXISTS video_views_video_idx ON public.video_views(video_id);
CREATE INDEX IF NOT EXISTS search_history_user_created_idx ON public.search_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_video_reports_video ON public.video_reports(video_id);
CREATE INDEX IF NOT EXISTS idx_video_reports_reporter ON public.video_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_created_at ON public.user_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS moderation_log_created_at_idx ON public.moderation_log (created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_log_action_idx ON public.moderation_log (action);

-- ---------------------------------------------------------------------
-- 3. SECURITY-DEFINER HELPER FUNCTIONS (final versions)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;



CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id AND permission = _permission);
$$;

-- ---------------------------------------------------------------------
-- 4. TRIGGER FUNCTIONS (final versions)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin new.updated_at = now(); return new; end; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  base_username text;
  candidate text;
  i int := 0;
  v_ip inet;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if length(base_username) < 3 then base_username := base_username || 'user'; end if;
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    i := i + 1;
    candidate := base_username || i::text;
  end loop;
  begin
    v_ip := nullif(new.raw_user_meta_data->>'signup_ip','')::inet;
  exception when others then v_ip := null;
  end;
  insert into public.profiles (user_id, username, display_name, signup_ip, last_ip)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate), v_ip, v_ip);
  return new;
end; $$;

CREATE OR REPLACE FUNCTION public.bump_likes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if tg_op = 'INSERT' then
    update public.videos set likes_count = likes_count + 1, reach_target = reach_target + 10 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set likes_count = greatest(likes_count - 1, 0) where id = old.video_id;
    return old;
  end if;
  return null;
end; $$;

CREATE OR REPLACE FUNCTION public.bump_replies()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if tg_op = 'INSERT' then
    update public.videos set replies_count = replies_count + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set replies_count = greatest(replies_count - 1, 0) where id = old.video_id;
    return old;
  end if;
  return null;
end; $$;

CREATE OR REPLACE FUNCTION public.bump_views()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  update public.videos set views_count = views_count + 1 where id = new.video_id;
  return new;
end; $$;

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
  v_parent_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.videos WHERE id = NEW.video_id;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT user_id INTO v_parent_owner FROM public.replies WHERE id = NEW.parent_reply_id;
    IF v_parent_owner IS NOT NULL AND v_parent_owner <> NEW.user_id THEN
      INSERT INTO public.notifications (user_id, actor_id, type, video_id, reply_id)
      VALUES (v_parent_owner, NEW.user_id, 'reply_to_reply', NEW.video_id, NEW.id);
    END IF;
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.cascade_delete_replies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.replies WHERE video_id = OLD.id;
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.update_video_report_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_video_id uuid;
  report_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_video_id := NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_video_id := OLD.video_id;
  ELSE
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO report_count FROM public.video_reports WHERE video_id = target_video_id;
  UPDATE public.video_reports SET priority = report_count WHERE video_id = target_video_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_user_report_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_user_id uuid;
  report_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_user_id := NEW.reported_user_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_user_id := OLD.reported_user_id;
  ELSE
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO report_count FROM public.user_reports WHERE reported_user_id = target_user_id;
  UPDATE public.user_reports SET priority = report_count WHERE reported_user_id = target_user_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

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
END; $$;

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
  IF v_actor IS NOT NULL AND v_actor <> OLD.user_id THEN
    INSERT INTO public.moderation_log (actor_id, action, target_type, target_id, target_label, details)
    VALUES (
      v_actor, 'video_deleted', 'video', OLD.id,
      COALESCE(v_email, v_username, OLD.user_id::text),
      jsonb_build_object('owner_id', OLD.user_id, 'owner_email', v_email, 'owner_username', v_username, 'caption', OLD.caption, 'was_archived', OLD.deleted_at IS NOT NULL)
    );
  END IF;
  RETURN OLD;
END; $$;

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
END; $$;

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
END; $$;

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
END; $$;

-- ---------------------------------------------------------------------
-- 5. ADMIN / ANALYTICS RPCs (final versions)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user_info(_user_id uuid)
RETURNS TABLE(user_id uuid, email text, signup_ip inet, last_ip inet, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'view_reports') OR public.has_permission(auth.uid(), 'manage_users')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, p.signup_ip, p.last_ip, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = _user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_video_info(_video_id uuid)
RETURNS TABLE(video_id uuid, owner_id uuid, owner_email text, posted_ip inet, owner_last_ip inet, owner_signup_ip inet)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'view_reports') OR public.has_permission(auth.uid(), 'manage_users')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT v.id, v.user_id, u.email::text, v.posted_ip, p.last_ip, p.signup_ip
  FROM public.videos v
  LEFT JOIN auth.users u ON u.id = v.user_id
  LEFT JOIN public.profiles p ON p.user_id = v.user_id
  WHERE v.id = _video_id;
END; $$;

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
END; $$;

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
END; $$;

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS TABLE (total_objects bigint, total_bytes bigint, per_user jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
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
END; $$;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS announcements_updated_at ON public.announcements;
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS likes_bump ON public.likes;
CREATE TRIGGER likes_bump AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.bump_likes();

DROP TRIGGER IF EXISTS replies_bump ON public.replies;
CREATE TRIGGER replies_bump AFTER INSERT OR DELETE ON public.replies
FOR EACH ROW EXECUTE FUNCTION public.bump_replies();

DROP TRIGGER IF EXISTS views_bump ON public.video_views;
CREATE TRIGGER views_bump AFTER INSERT ON public.video_views
FOR EACH ROW EXECUTE FUNCTION public.bump_views();

DROP TRIGGER IF EXISTS trg_notify_on_like ON public.likes;
CREATE TRIGGER trg_notify_on_like AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

DROP TRIGGER IF EXISTS trg_cleanup_like_notification ON public.likes;
CREATE TRIGGER trg_cleanup_like_notification AFTER DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.cleanup_like_notification();

DROP TRIGGER IF EXISTS trg_notify_on_reply ON public.replies;
CREATE TRIGGER trg_notify_on_reply AFTER INSERT ON public.replies
FOR EACH ROW EXECUTE FUNCTION public.notify_on_reply();

DROP TRIGGER IF EXISTS trg_cascade_delete_replies ON public.videos;
CREATE TRIGGER trg_cascade_delete_replies BEFORE DELETE ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.cascade_delete_replies();

DROP TRIGGER IF EXISTS trg_update_video_report_priority ON public.video_reports;
CREATE TRIGGER trg_update_video_report_priority AFTER INSERT OR DELETE ON public.video_reports
FOR EACH ROW EXECUTE FUNCTION public.update_video_report_priority();

DROP TRIGGER IF EXISTS trg_update_user_report_priority ON public.user_reports;
CREATE TRIGGER trg_update_user_report_priority AFTER INSERT OR DELETE ON public.user_reports
FOR EACH ROW EXECUTE FUNCTION public.update_user_report_priority();

DROP TRIGGER IF EXISTS trg_log_video_archive ON public.videos;
CREATE TRIGGER trg_log_video_archive AFTER UPDATE ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.log_video_archive();

DROP TRIGGER IF EXISTS trg_log_video_delete ON public.videos;
CREATE TRIGGER trg_log_video_delete BEFORE DELETE ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.log_video_delete();

DROP TRIGGER IF EXISTS trg_log_announcement_post ON public.announcements;
CREATE TRIGGER trg_log_announcement_post AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.log_announcement_post();

DROP TRIGGER IF EXISTS trg_log_announcement_delete ON public.announcements;
CREATE TRIGGER trg_log_announcement_delete BEFORE DELETE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.log_announcement_delete();

DROP TRIGGER IF EXISTS trg_log_account_delete ON public.profiles;
CREATE TRIGGER trg_log_account_delete AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_account_delete();

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (final policy set)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_log    ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles public read" ON public.profiles FOR SELECT
  USING (deleted_at IS NULL OR auth.uid() = user_id OR public.has_permission(auth.uid(), 'manage_users'));
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE
  USING (public.has_permission(auth.uid(), 'manage_users'));

-- videos
CREATE POLICY "videos public read" ON public.videos FOR SELECT
  USING (deleted_at IS NULL OR auth.uid() = user_id OR public.has_permission(auth.uid(), 'manage_users'));
CREATE POLICY "users insert own videos" ON public.videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own videos" ON public.videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own videos" ON public.videos FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "admins delete any video" ON public.videos FOR DELETE
  USING (public.has_permission(auth.uid(), 'manage_users'));

-- replies
CREATE POLICY "replies public read" ON public.replies FOR SELECT USING (true);
CREATE POLICY "users insert own replies" ON public.replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own replies" ON public.replies FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "admins delete any reply" ON public.replies FOR DELETE
  USING (public.has_permission(auth.uid(), 'manage_users'));

-- follows
CREATE POLICY "follows public read" ON public.follows FOR SELECT USING (true);
CREATE POLICY "users follow others" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "users unfollow" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- likes
CREATE POLICY "likes public read" ON public.likes FOR SELECT USING (true);
CREATE POLICY "users like" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users unlike" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- video_views
CREATE POLICY "views public read" ON public.video_views FOR SELECT USING (true);
CREATE POLICY "insert own or anonymous view" ON public.video_views FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- search_history
CREATE POLICY "users read own search history" ON public.search_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own search history" ON public.search_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own search history" ON public.search_history FOR DELETE USING (auth.uid() = user_id);

-- blocks
CREATE POLICY "blocks readable by involved users" ON public.blocks FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);
CREATE POLICY "users create own blocks" ON public.blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "users remove own blocks" ON public.blocks FOR DELETE USING (auth.uid() = blocker_id);

-- video_reports
CREATE POLICY "users insert own reports" ON public.video_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "users read own reports" ON public.video_reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "admins read all reports" ON public.video_reports FOR SELECT
  USING (public.has_permission(auth.uid(), 'view_reports'));
CREATE POLICY "admins delete reports" ON public.video_reports FOR DELETE
  USING (public.has_permission(auth.uid(), 'view_reports'));

-- user_reports
CREATE POLICY "users insert own user reports" ON public.user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "users read own user reports" ON public.user_reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "admins read all user reports" ON public.user_reports FOR SELECT
  USING (public.has_permission(auth.uid(), 'view_reports'));
CREATE POLICY "admins delete user reports" ON public.user_reports FOR DELETE
  USING (public.has_permission(auth.uid(), 'view_reports'));

-- user_roles
CREATE POLICY "user_roles readable by self and admins" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
-- Super admins manage admins only; super_admin rows are immutable via the API
-- (see rls-superadmin-protection.sql for the matching triggers).
CREATE POLICY "super_admin inserts admin roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND role <> 'super_admin' AND NOT public.is_super_admin(user_id));
CREATE POLICY "super_admin updates admin roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') AND role <> 'super_admin' AND NOT public.is_super_admin(user_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND role <> 'super_admin' AND NOT public.is_super_admin(user_id));
CREATE POLICY "super_admin deletes admin roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') AND role <> 'super_admin');

-- admin_permissions
CREATE POLICY "admin_permissions readable by self and admins" ON public.admin_permissions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "super_admin inserts admin permissions" ON public.admin_permissions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND NOT public.is_super_admin(user_id));
CREATE POLICY "super_admin updates admin permissions" ON public.admin_permissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') AND NOT public.is_super_admin(user_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND NOT public.is_super_admin(user_id));
CREATE POLICY "super_admin deletes admin permissions" ON public.admin_permissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') AND NOT public.is_super_admin(user_id));


-- announcements
CREATE POLICY "announcements public read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "announcements admin insert" ON public.announcements FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'post_announcements'));
CREATE POLICY "announcements admin update" ON public.announcements FOR UPDATE
  USING (public.has_permission(auth.uid(), 'post_announcements'));
CREATE POLICY "announcements admin delete" ON public.announcements FOR DELETE
  USING (public.has_permission(auth.uid(), 'post_announcements'));

-- user_bans
CREATE POLICY "bans admin read" ON public.user_bans FOR SELECT
  USING (public.has_permission(auth.uid(), 'manage_users'));
CREATE POLICY "bans admin write" ON public.user_bans FOR ALL
  USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));

-- notifications (no INSERT policy: only SECURITY DEFINER triggers insert)
CREATE POLICY "users read own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- moderation_log (read-only for admins; written by triggers)
CREATE POLICY "admins read moderation log" ON public.moderation_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'view_reports'));

-- ---------------------------------------------------------------------
-- 8. DATA API GRANTS (final state, incl. column-level IP protection)
-- ---------------------------------------------------------------------

-- Baseline: authenticated CRUD + service_role ALL on every public table.
DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END $$;

-- Anonymous read access for tables with permissive public-read policies.
GRANT SELECT ON public.likes           TO anon;
GRANT SELECT ON public.follows         TO anon;
GRANT SELECT ON public.video_views     TO anon;
GRANT SELECT ON public.announcements   TO anon;
GRANT INSERT ON public.video_views     TO anon;

-- moderation_log is admin-read only.
GRANT SELECT ON public.moderation_log TO authenticated;
GRANT ALL    ON public.moderation_log TO service_role;

-- Column-level privileges hide IP columns from anon/authenticated.
-- A column REVOKE is a no-op while a table-wide grant exists, so drop the
-- table-level grant first and re-grant per column.

-- profiles (hides signup_ip, last_ip)
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

-- videos (hides posted_ip)
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
-- Counter triggers run SECURITY INVOKER, including for signed-out viewers.
GRANT UPDATE (views_count, likes_count, replies_count, reach_target)
  ON public.videos TO anon;
GRANT DELETE ON public.videos TO authenticated;

-- replies (hides posted_ip)
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

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.videos   TO service_role;
GRANT ALL ON public.replies  TO service_role;

-- ---------------------------------------------------------------------
-- 9. FUNCTION EXECUTE PRIVILEGES (final state)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_get_user_info(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_video_info(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_user_analytics(uuid, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_platform_avg_session_seconds(timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_search_archived_videos(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_storage_stats() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_get_user_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_video_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_analytics(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_avg_session_seconds(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_archived_videos(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_stats() TO authenticated;

-- Helpers used inside RLS policies must be executable by the calling role.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                  TO anon, authenticated;

-- Trigger-only functions: never callable via RPC.
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

-- ---------------------------------------------------------------------
-- 10. STORAGE (bucket + object policies)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "videos bucket public read" ON storage.objects;
CREATE POLICY "videos bucket public read" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');

DROP POLICY IF EXISTS "users upload own videos" ON storage.objects;
CREATE POLICY "users upload own videos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "users update own video files" ON storage.objects;
CREATE POLICY "users update own video files" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "users delete own video files" ON storage.objects;
CREATE POLICY "users delete own video files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ---------------------------------------------------------------------
-- 11. REALTIME
-- ---------------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 12. SUPER ADMIN BOOTSTRAP
-- ---------------------------------------------------------------------
-- Deliberately no users are created here. Sign up your two accounts through
-- the app / Supabase Auth first, then run:
--
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'super_admin' FROM auth.users
-- WHERE email IN ('podgorskiy.serge@gmail.com','podgorskiy.serge@unapsetech.com')
-- ON CONFLICT (user_id, role) DO NOTHING;
--
-- has_permission() returns true for every permission when the role is
-- super_admin, so no admin_permissions rows are needed for those accounts.
-- =====================================================================
