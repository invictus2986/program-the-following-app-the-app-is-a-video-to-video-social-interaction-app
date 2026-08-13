
-- PROFILES
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles public read" on public.profiles for select using (true);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = user_id);

-- VIDEOS (original posts)
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  thumbnail_url text,
  caption text,
  hashtags text[] not null default '{}',
  duration_seconds int,
  views_count int not null default 0,
  likes_count int not null default 0,
  replies_count int not null default 0,
  reach_target int not null default 200,
  created_at timestamptz not null default now()
);
alter table public.videos enable row level security;
create policy "videos public read" on public.videos for select using (true);
create policy "users insert own videos" on public.videos for insert with check (auth.uid() = user_id);
create policy "users update own videos" on public.videos for update using (auth.uid() = user_id);
create policy "users delete own videos" on public.videos for delete using (auth.uid() = user_id);
create index videos_hashtags_idx on public.videos using gin(hashtags);
create index videos_user_idx on public.videos(user_id);
create index videos_created_idx on public.videos(created_at desc);

-- REPLIES (only on original videos)
create table public.replies (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  duration_seconds int,
  created_at timestamptz not null default now()
);
alter table public.replies enable row level security;
create policy "replies public read" on public.replies for select using (true);
create policy "users insert own replies" on public.replies for insert with check (auth.uid() = user_id);
create policy "users delete own replies" on public.replies for delete using (auth.uid() = user_id);
create index replies_video_idx on public.replies(video_id);
create index replies_user_idx on public.replies(user_id);

-- FOLLOWS
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows enable row level security;
create policy "follows public read" on public.follows for select using (true);
create policy "users follow others" on public.follows for insert with check (auth.uid() = follower_id);
create policy "users unfollow" on public.follows for delete using (auth.uid() = follower_id);

-- LIKES
create table public.likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.likes enable row level security;
create policy "likes public read" on public.likes for select using (true);
create policy "users like" on public.likes for insert with check (auth.uid() = user_id);
create policy "users unlike" on public.likes for delete using (auth.uid() = user_id);

-- VIEWS (impressions tracking)
create table public.video_views (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.video_views enable row level security;
create policy "views public read" on public.video_views for select using (true);
create policy "anyone insert view" on public.video_views for insert with check (true);
create index video_views_video_idx on public.video_views(video_id);

-- TRIGGER FUNCTIONS
create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.update_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  candidate text;
  i int := 0;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if length(base_username) < 3 then base_username := base_username || 'user'; end if;
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    i := i + 1;
    candidate := base_username || i::text;
  end loop;
  insert into public.profiles (user_id, username, display_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Counter triggers
create or replace function public.bump_likes() returns trigger language plpgsql set search_path = public as $$
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
create trigger likes_bump after insert or delete on public.likes
for each row execute function public.bump_likes();

create or replace function public.bump_replies() returns trigger language plpgsql set search_path = public as $$
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
create trigger replies_bump after insert or delete on public.replies
for each row execute function public.bump_replies();

create or replace function public.bump_views() returns trigger language plpgsql set search_path = public as $$
begin
  update public.videos set views_count = views_count + 1 where id = new.video_id;
  return new;
end; $$;
create trigger views_bump after insert on public.video_views
for each row execute function public.bump_views();

-- STORAGE
insert into storage.buckets (id, name, public) values ('videos', 'videos', true) on conflict do nothing;

create policy "videos bucket public read" on storage.objects
for select using (bucket_id = 'videos');

create policy "users upload own videos" on storage.objects
for insert with check (
  bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "users update own video files" on storage.objects
for update using (
  bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "users delete own video files" on storage.objects
for delete using (
  bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_user_id_fkey') THEN
    ALTER TABLE public.videos ADD CONSTRAINT videos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replies_video_id_fkey') THEN
    ALTER TABLE public.replies ADD CONSTRAINT replies_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'likes_video_id_fkey') THEN
    ALTER TABLE public.likes ADD CONSTRAINT likes_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
  END IF;
END $$;
create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tag text not null,
  created_at timestamptz not null default now()
);
create index search_history_user_created_idx on public.search_history (user_id, created_at desc);
alter table public.search_history enable row level security;
create policy "users read own search history" on public.search_history for select using (auth.uid() = user_id);
create policy "users insert own search history" on public.search_history for insert with check (auth.uid() = user_id);
create policy "users delete own search history" on public.search_history for delete using (auth.uid() = user_id);
CREATE TABLE public.blocks (
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks readable by involved users"
ON public.blocks FOR SELECT
USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "users create own blocks"
ON public.blocks FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "users remove own blocks"
ON public.blocks FOR DELETE
USING (auth.uid() = blocker_id);

CREATE INDEX idx_blocks_blocked ON public.blocks(blocked_id);
CREATE INDEX idx_blocks_blocker ON public.blocks(blocker_id);
CREATE TABLE public.video_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own reports" ON public.video_reports
FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "users read own reports" ON public.video_reports
FOR SELECT USING (auth.uid() = reporter_id);

CREATE INDEX idx_video_reports_video ON public.video_reports(video_id);
CREATE INDEX idx_video_reports_reporter ON public.video_reports(reporter_id);
-- 1. Roles enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin');

-- 2. user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. admin_permissions table (granular flags)
CREATE TABLE public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- 4. announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. user_bans
CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  banned_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- 6. helper: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 7. helper: is_admin (super_admin OR admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- 8. helper: has_permission (super_admin always has all permissions)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id AND permission = _permission);
$$;

-- 9. RLS policies for user_roles
CREATE POLICY "user_roles readable by self and admins" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "super_admin manages roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 10. RLS for admin_permissions
CREATE POLICY "admin_permissions readable by self and admins" ON public.admin_permissions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "super_admin manages permissions" ON public.admin_permissions
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 11. RLS for announcements
CREATE POLICY "announcements public read" ON public.announcements
  FOR SELECT USING (true);
CREATE POLICY "announcements admin insert" ON public.announcements
  FOR INSERT WITH CHECK (public.has_permission(auth.uid(), 'post_announcements'));
CREATE POLICY "announcements admin update" ON public.announcements
  FOR UPDATE USING (public.has_permission(auth.uid(), 'post_announcements'));
CREATE POLICY "announcements admin delete" ON public.announcements
  FOR DELETE USING (public.has_permission(auth.uid(), 'post_announcements'));

-- 12. RLS for user_bans
CREATE POLICY "bans admin read" ON public.user_bans
  FOR SELECT USING (public.has_permission(auth.uid(), 'manage_users'));
CREATE POLICY "bans admin write" ON public.user_bans
  FOR ALL USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));

-- 13. Extend video_reports: admins with view_reports can read & delete
CREATE POLICY "admins read all reports" ON public.video_reports
  FOR SELECT USING (public.has_permission(auth.uid(), 'view_reports'));
CREATE POLICY "admins delete reports" ON public.video_reports
  FOR DELETE USING (public.has_permission(auth.uid(), 'view_reports'));

-- 14. Extend videos: admins with manage_users can delete any
CREATE POLICY "admins delete any video" ON public.videos
  FOR DELETE USING (public.has_permission(auth.uid(), 'manage_users'));

-- 15. Extend profiles: admins with manage_users can read all (already public, but for clarity, also allow update for manage_users)
CREATE POLICY "admins update any profile" ON public.profiles
  FOR UPDATE USING (public.has_permission(auth.uid(), 'manage_users'));

-- 16. Seed first existing user as super_admin
DO $$
DECLARE
  first_user uuid;
BEGIN
  SELECT user_id INTO first_user FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (first_user, 'super_admin')
      ON CONFLICT DO NOTHING;
  END IF;
END $$;

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

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS video_storage_path text,
  ADD COLUMN IF NOT EXISTS video_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS video_duration_seconds integer;

ALTER TABLE public.announcements ALTER COLUMN body DROP NOT NULL;


CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own user reports"
  ON public.user_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "users read own user reports"
  ON public.user_reports FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE POLICY "admins read all user reports"
  ON public.user_reports FOR SELECT
  USING (public.has_permission(auth.uid(), 'view_reports'));

CREATE POLICY "admins delete user reports"
  ON public.user_reports FOR DELETE
  USING (public.has_permission(auth.uid(), 'view_reports'));

CREATE INDEX idx_user_reports_created_at ON public.user_reports (created_at DESC);
CREATE INDEX idx_user_reports_reported ON public.user_reports (reported_user_id);

ALTER TABLE public.user_bans ADD COLUMN IF NOT EXISTS expires_at timestamptz;


ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS posted_ip inet;
ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS posted_ip inet;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_ip inet;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_ip inet;

-- Admin lookup: returns email + IPs for a given user. Permission-gated.
CREATE OR REPLACE FUNCTION public.admin_get_user_info(_user_id uuid)
RETURNS TABLE(user_id uuid, email text, signup_ip inet, last_ip inet, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'view_reports') OR public.has_permission(auth.uid(), 'manage_users')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, p.signup_ip, p.last_ip, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = _user_id;
END;
$$;

-- Admin lookup: returns owner email + posted IP for a given video.
CREATE OR REPLACE FUNCTION public.admin_get_video_info(_video_id uuid)
RETURNS TABLE(video_id uuid, owner_id uuid, owner_email text, posted_ip inet, owner_last_ip inet, owner_signup_ip inet)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_video_info(uuid) TO authenticated;

-- Capture signup IP when a profile is auto-created via handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Add priority columns
ALTER TABLE public.video_reports ADD COLUMN priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_reports ADD COLUMN priority integer NOT NULL DEFAULT 0;

-- Function to update video report priorities
CREATE OR REPLACE FUNCTION public.update_video_report_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
END;
$$;

-- Function to update user report priorities
CREATE OR REPLACE FUNCTION public.update_user_report_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
END;
$$;

-- Triggers for video reports
CREATE TRIGGER trg_update_video_report_priority
AFTER INSERT OR DELETE ON public.video_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_video_report_priority();

-- Triggers for user reports
CREATE TRIGGER trg_update_user_report_priority
AFTER INSERT OR DELETE ON public.user_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_user_report_priority();

-- Backfill existing reports with current counts
UPDATE public.video_reports SET priority = (
  SELECT COUNT(*) FROM public.video_reports vr2 WHERE vr2.video_id = video_reports.video_id
);
UPDATE public.user_reports SET priority = (
  SELECT COUNT(*) FROM public.user_reports ur2 WHERE ur2.reported_user_id = user_reports.reported_user_id
);


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


ALTER TABLE public.replies
  ADD COLUMN parent_reply_id uuid REFERENCES public.replies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS replies_parent_reply_id_idx ON public.replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS replies_video_id_idx ON public.replies(video_id);


-- Restore Data API grants for all public tables.
-- Authenticated users get full CRUD (RLS still enforces row-level rules).
-- Anonymous users get SELECT only on tables with permissive read policies.
-- service_role gets ALL on every table.

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END;
$$;

-- Anonymous read access for tables with permissive public-read policies.
GRANT SELECT ON public.videos TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.replies TO anon;
GRANT SELECT ON public.follows TO anon;
GRANT SELECT ON public.video_views TO anon;
GRANT SELECT ON public.announcements TO anon;
GRANT INSERT ON public.video_views TO anon;


-- 1. Fix is_admin: only super_admin/admin roles count as admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
  );
$$;

-- 2. Hide IP columns from public/authenticated readers via column-level privileges.
--    RLS still allows row read for public, but PostgREST will refuse to project these columns.
REVOKE SELECT (signup_ip, last_ip) ON public.profiles FROM anon, authenticated;
REVOKE SELECT (posted_ip) ON public.videos FROM anon, authenticated;
REVOKE SELECT (posted_ip) ON public.replies FROM anon, authenticated;
-- service_role retains full access; admin RPCs use SECURITY DEFINER and bypass column grants.

-- 3. Tighten video_views insert to prevent spoofing another user's identity
DROP POLICY IF EXISTS "anyone insert view" ON public.video_views;
CREATE POLICY "insert own or anonymous view"
ON public.video_views
FOR INSERT TO anon, authenticated
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- 4. Revoke EXECUTE on SECURITY DEFINER helpers from anon (keep authenticated where needed)
REVOKE EXECUTE ON FUNCTION public.admin_get_user_info(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_video_info(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_user_analytics(uuid, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_platform_avg_session_seconds(timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_search_archived_videos(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_storage_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_get_user_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_video_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_analytics(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_avg_session_seconds(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_archived_videos(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_stats() TO authenticated;


-- Re-grant helpers used inside RLS policies (must be executable by the calling role)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;

-- Lock down trigger functions (only invoked by triggers, never by user RPC)
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

CREATE OR REPLACE FUNCTION public.notify_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;
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
