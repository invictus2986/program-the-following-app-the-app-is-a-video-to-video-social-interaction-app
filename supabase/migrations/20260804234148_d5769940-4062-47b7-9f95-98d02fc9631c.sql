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