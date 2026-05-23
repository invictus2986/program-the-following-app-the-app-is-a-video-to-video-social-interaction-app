import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, ExternalLink, Ban, ShieldOff, Clock } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";

export const Route = createFileRoute("/admin/user-reports")({
  component: AdminUserReports,
});

type Report = {
  id: string;
  reported_user_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
};
type ProfMap = Record<string, { username: string; display_name: string | null }>;

function AdminUserReports() {
  const { user } = useAuth();
  const { permissions } = useAdminRole();
  const canManage = permissions.has("manage_users");
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<ProfMap>({});
  const [bans, setBans] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_reports")
      .select("id,reported_user_id,reporter_id,reason,details,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as Report[];
    setReports(list);
    const ids = Array.from(new Set(list.flatMap((r) => [r.reported_user_id, r.reporter_id])));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username,display_name")
        .in("user_id", ids);
      const map: ProfMap = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = { username: p.username, display_name: p.display_name }; });
      setProfiles(map);
    }
    const { data: b } = await supabase.from("user_bans").select("user_id");
    setBans(new Set((b ?? []).map((r) => r.user_id)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const dismiss = async (id: string) => {
    const { error } = await supabase.from("user_reports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Report dismissed");
    load();
  };

  const suspend = async (uid: string, days: number | null) => {
    if (!user) return;
    const reason = prompt("Reason for suspension?") ?? "";
    const expires = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const { error } = await supabase.from("user_bans").insert({
      user_id: uid, banned_by: user.id, reason, expires_at: expires,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(days ? `Suspended for ${days} days` : "Banned");
    load();
  };

  const unban = async (uid: string) => {
    const { error } = await supabase.from("user_bans").delete().eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed suspension");
    load();
  };

  const deleteAccount = async (uid: string) => {
    if (!confirm("Delete this account? This soft-deletes the profile and removes all their videos. This cannot be undone.")) return;
    const { error: vErr } = await supabase.from("videos").delete().eq("user_id", uid);
    if (vErr) { toast.error(vErr.message); return; }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", uid);
    if (pErr) { toast.error(pErr.message); return; }
    toast.success("Account deleted");
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading reports…</p>;
  if (reports.length === 0) return <p className="text-sm text-muted-foreground">No user reports.</p>;

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const reported = profiles[r.reported_user_id];
        const reporter = profiles[r.reporter_id];
        const banned = bans.has(r.reported_user_id);
        return (
          <div key={r.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-semibold capitalize">{r.reason.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-1">
              Reported user: <span className="font-medium text-foreground">@{reported?.username ?? r.reported_user_id.slice(0, 8)}</span>
              {" · "}by @{reporter?.username ?? r.reporter_id.slice(0, 8)}
              {banned && <span className="text-destructive"> · currently suspended</span>}
            </p>
            {r.details && <p className="text-sm whitespace-pre-wrap break-words mb-3">{r.details}</p>}
            <div className="flex gap-2 flex-wrap">
              {reported?.username && (
                <Link to="/u/$username" params={{ username: reported.username }}>
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> View profile
                  </Button>
                </Link>
              )}
              {canManage && !banned && (
                <>
                  <Button size="sm" variant="outline" onClick={() => suspend(r.reported_user_id, 7)}>
                    <Clock className="h-3.5 w-3.5 mr-1" /> Suspend 7d
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => suspend(r.reported_user_id, 30)}>
                    <Clock className="h-3.5 w-3.5 mr-1" /> Suspend 30d
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => suspend(r.reported_user_id, null)}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Ban
                  </Button>
                </>
              )}
              {canManage && banned && (
                <Button size="sm" variant="outline" onClick={() => unban(r.reported_user_id)}>
                  <ShieldOff className="h-3.5 w-3.5 mr-1" /> Lift suspension
                </Button>
              )}
              {canManage && (
                <Button size="sm" variant="destructive" onClick={() => deleteAccount(r.reported_user_id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete account
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => dismiss(r.id)}>Dismiss</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}