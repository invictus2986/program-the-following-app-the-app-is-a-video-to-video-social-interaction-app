
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
