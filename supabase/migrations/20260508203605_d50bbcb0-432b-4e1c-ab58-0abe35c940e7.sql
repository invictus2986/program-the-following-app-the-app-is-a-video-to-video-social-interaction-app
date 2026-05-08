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