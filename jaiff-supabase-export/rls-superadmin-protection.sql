-- Jaiff — harden role management at the database level.
-- Goal: a super_admin can fully manage admins, but NO API caller (including
-- another super_admin) can insert, modify, or delete a super_admin row.
-- Super-admin grants are done only by the project owner via the SQL editor /
-- service role, where auth.uid() is NULL.
--
-- Apply this once against your Supabase project (SQL editor).

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: is the target user a super_admin? (security definer so it can read
-- user_roles regardless of the caller's RLS visibility)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- user_roles: replace the blanket FOR ALL policy with per-command policies
-- that exclude super_admin rows and super_admin targets.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin manages roles" ON public.user_roles;

-- Promote a regular user to admin (never to super_admin, never touching a
-- user who already holds super_admin).
CREATE POLICY "super_admin inserts admin roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    AND role <> 'super_admin'
    AND NOT public.is_super_admin(user_id)
  );

-- Change an existing admin row; the row before AND after must be a non-super_admin.
CREATE POLICY "super_admin updates admin roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    AND role <> 'super_admin'
    AND NOT public.is_super_admin(user_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    AND role <> 'super_admin'
    AND NOT public.is_super_admin(user_id)
  );

-- Demote an admin back to a regular user.
CREATE POLICY "super_admin deletes admin roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    AND role <> 'super_admin'
  );

-- ---------------------------------------------------------------------------
-- admin_permissions: same shape — a super_admin's permission rows are off limits.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin manages permissions" ON public.admin_permissions;

CREATE POLICY "super_admin inserts admin permissions" ON public.admin_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    AND NOT public.is_super_admin(user_id)
  );

CREATE POLICY "super_admin updates admin permissions" ON public.admin_permissions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    AND NOT public.is_super_admin(user_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    AND NOT public.is_super_admin(user_id)
  );

CREATE POLICY "super_admin deletes admin permissions" ON public.admin_permissions
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    AND NOT public.is_super_admin(user_id)
  );

-- ---------------------------------------------------------------------------
-- Defense in depth: a trigger that fires even for code paths that bypass RLS
-- (e.g. a leaked service-role key used through PostgREST with a JWT present).
-- auth.uid() IS NULL means "owner via SQL editor" and is allowed, so you can
-- still seed / rotate super_admins yourself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_super_admin_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'super_admin' THEN
    RAISE EXCEPTION 'super_admin roles can only be granted by the project owner';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role = 'super_admin' THEN
    RAISE EXCEPTION 'super_admin roles cannot be modified or removed through the app';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'super_admin' THEN
    RAISE EXCEPTION 'super_admin roles can only be granted by the project owner';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_rows ON public.user_roles;
CREATE TRIGGER trg_protect_super_admin_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_rows();

CREATE OR REPLACE FUNCTION public.protect_super_admin_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.is_super_admin(COALESCE(NEW.user_id, OLD.user_id))
     AND COALESCE(NEW.user_id, OLD.user_id) <> auth.uid() THEN
    RAISE EXCEPTION 'permissions of a super_admin cannot be modified through the app';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_permissions ON public.admin_permissions;
CREATE TRIGGER trg_protect_super_admin_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_permissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_permissions();

COMMIT;
