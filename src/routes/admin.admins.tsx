import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ALL_PERMISSIONS, type Permission } from "@/hooks/useAdminRole";
import { UserMinus, UserPlus } from "lucide-react";

export const Route = createFileRoute("/admin/admins")({
  component: AdminAdmins,
});

type AdminRow = {
  user_id: string;
  username: string;
  role: "super_admin" | "admin";
  permissions: Set<Permission>;
};

function AdminAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ user_id: string; username: string }>>([]);

  const load = async () => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id,role");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) { setAdmins([]); return; }
    const [profsRes, permsRes] = await Promise.all([
      supabase.from("profiles").select("user_id,username").in("user_id", ids),
      supabase.from("admin_permissions").select("user_id,permission").in("user_id", ids),
    ]);
    const profMap = new Map((profsRes.data ?? []).map((p) => [p.user_id, p.username]));
    const permMap = new Map<string, Set<Permission>>();
    (permsRes.data ?? []).forEach((p) => {
      const s = permMap.get(p.user_id) ?? new Set<Permission>();
      s.add(p.permission as Permission);
      permMap.set(p.user_id, s);
    });
    setAdmins((roles ?? []).map((r) => ({
      user_id: r.user_id,
      username: profMap.get(r.user_id) ?? r.user_id.slice(0, 8),
      role: r.role as "super_admin" | "admin",
      permissions: permMap.get(r.user_id) ?? new Set(),
    })));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!q.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id,username")
        .ilike("username", `%${q.trim()}%`)
        .limit(10);
      setSearchResults((data ?? []) as Array<{ user_id: string; username: string }>);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const promote = async (uid: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin", granted_by: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("User promoted to admin");
    setQ(""); setSearchResults([]);
    load();
  };
  const demote = async (uid: string) => {
    if (!confirm("Remove admin role from this user?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    if (error) { toast.error(error.message); return; }
    await supabase.from("admin_permissions").delete().eq("user_id", uid);
    toast.success("Admin removed");
    load();
  };
  const togglePerm = async (uid: string, perm: Permission, on: boolean) => {
    if (on) {
      const { error } = await supabase.from("admin_permissions").insert({ user_id: uid, permission: perm, granted_by: user?.id });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("admin_permissions").delete().eq("user_id", uid).eq("permission", perm);
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border p-4 space-y-3">
        <h2 className="font-semibold">Promote user to admin</h2>
        <Input placeholder="Search username…" value={q} onChange={(e) => setQ(e.target.value)} />
        {searchResults.length > 0 && (
          <ul className="space-y-1">
            {searchResults
              // Never offer to "promote" someone who already holds a role —
              // super admins in particular must not be touched from here.
              .filter((u) => !admins.some((a) => a.user_id === u.user_id))
              .map((u) => (
              <li key={u.user_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                <span className="text-sm">@{u.username}</span>
                <Button size="sm" variant="outline" onClick={() => promote(u.user_id)}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Make admin
                </Button>
              </li>
            ))}
          </ul>
        )}

      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Current admins</h2>
        {admins.map((a) => (
          <div key={a.user_id + a.role} className="rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">@{a.username}</p>
                <p className="text-xs text-muted-foreground font-mono">{a.role}</p>
              </div>
              {a.role === "admin" && (
                <Button size="sm" variant="destructive" onClick={() => demote(a.user_id)}>
                  <UserMinus className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              )}
            </div>
            {a.role === "admin" && (
              <div className="grid grid-cols-2 gap-2">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={a.permissions.has(p)}
                      onChange={(e) => togglePerm(a.user_id, p, e.target.checked)}
                    />
                    <span className="capitalize">{p.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
            )}
            {a.role === "super_admin" && (
              <p className="text-xs text-muted-foreground">Has all permissions.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}