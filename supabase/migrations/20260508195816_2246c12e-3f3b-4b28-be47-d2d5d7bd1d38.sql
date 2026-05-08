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