
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
