
ALTER TABLE public.replies
  ADD COLUMN parent_reply_id uuid REFERENCES public.replies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS replies_parent_reply_id_idx ON public.replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS replies_video_id_idx ON public.replies(video_id);
