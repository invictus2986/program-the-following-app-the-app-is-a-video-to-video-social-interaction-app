
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS video_storage_path text,
  ADD COLUMN IF NOT EXISTS video_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS video_duration_seconds integer;

ALTER TABLE public.announcements ALTER COLUMN body DROP NOT NULL;
