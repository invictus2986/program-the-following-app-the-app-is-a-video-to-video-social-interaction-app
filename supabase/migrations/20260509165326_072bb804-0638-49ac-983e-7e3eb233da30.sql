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