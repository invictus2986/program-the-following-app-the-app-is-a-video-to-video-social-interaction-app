
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
