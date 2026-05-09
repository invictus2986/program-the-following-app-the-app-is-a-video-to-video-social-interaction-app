-- 1. Roles enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin');

-- 2. user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. admin_permissions table (granular flags)
CREATE TABLE public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- 4. announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. user_bans
CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  banned_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- 6. helper: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 7. helper: is_admin (super_admin OR admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- 8. helper: has_permission (super_admin always has all permissions)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id AND permission = _permission);
$$;

-- 9. RLS policies for user_roles
CREATE POLICY "user_roles readable by self and admins" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "super_admin manages roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 10. RLS for admin_permissions
CREATE POLICY "admin_permissions readable by self and admins" ON public.admin_permissions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "super_admin manages permissions" ON public.admin_permissions
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 11. RLS for announcements
CREATE POLICY "announcements public read" ON public.announcements
  FOR SELECT USING (true);
CREATE POLICY "announcements admin insert" ON public.announcements
  FOR INSERT WITH CHECK (public.has_permission(auth.uid(), 'post_announcements'));
CREATE POLICY "announcements admin update" ON public.announcements
  FOR UPDATE USING (public.has_permission(auth.uid(), 'post_announcements'));
CREATE POLICY "announcements admin delete" ON public.announcements
  FOR DELETE USING (public.has_permission(auth.uid(), 'post_announcements'));

-- 12. RLS for user_bans
CREATE POLICY "bans admin read" ON public.user_bans
  FOR SELECT USING (public.has_permission(auth.uid(), 'manage_users'));
CREATE POLICY "bans admin write" ON public.user_bans
  FOR ALL USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));

-- 13. Extend video_reports: admins with view_reports can read & delete
CREATE POLICY "admins read all reports" ON public.video_reports
  FOR SELECT USING (public.has_permission(auth.uid(), 'view_reports'));
CREATE POLICY "admins delete reports" ON public.video_reports
  FOR DELETE USING (public.has_permission(auth.uid(), 'view_reports'));

-- 14. Extend videos: admins with manage_users can delete any
CREATE POLICY "admins delete any video" ON public.videos
  FOR DELETE USING (public.has_permission(auth.uid(), 'manage_users'));

-- 15. Extend profiles: admins with manage_users can read all (already public, but for clarity, also allow update for manage_users)
CREATE POLICY "admins update any profile" ON public.profiles
  FOR UPDATE USING (public.has_permission(auth.uid(), 'manage_users'));

-- 16. Seed first existing user as super_admin
DO $$
DECLARE
  first_user uuid;
BEGIN
  SELECT user_id INTO first_user FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (first_user, 'super_admin')
      ON CONFLICT DO NOTHING;
  END IF;
END $$;