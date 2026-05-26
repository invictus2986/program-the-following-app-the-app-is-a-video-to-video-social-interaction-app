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
