import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AdminRole = "super_admin" | "admin" | null;

const ALL_PERMS = [
  "post_announcements",
  "view_reports",
  "view_analytics",
  "manage_users",
  "manage_admins",
] as const;
export type Permission = (typeof ALL_PERMS)[number];

export function useAdminRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AdminRole>(null);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setRole(null);
        setPermissions(new Set());
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const r: AdminRole = isSuper ? "super_admin" : isAdmin ? "admin" : null;
      setRole(r);
      if (isSuper) {
        setPermissions(new Set(ALL_PERMS));
      } else if (isAdmin) {
        const { data: perms } = await supabase
          .from("admin_permissions")
          .select("permission")
          .eq("user_id", user.id);
        if (cancelled) return;
        setPermissions(new Set((perms ?? []).map((p) => p.permission as Permission)));
      } else {
        setPermissions(new Set());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { role, permissions, loading, isAdmin: role !== null };
}

export const ALL_PERMISSIONS = ALL_PERMS;