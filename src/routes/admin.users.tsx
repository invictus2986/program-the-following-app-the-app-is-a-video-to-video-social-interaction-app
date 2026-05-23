import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Ban, ShieldOff, Trash2, ExternalLink, Clock, UserX } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

type Profile = { user_id: string; username: string; display_name: string | null; created_at: string; deleted_at: string | null };

function AdminUsers() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Profile[]>([]);
  const [bans, setBans] = useState<Set<string>>(new Set());

  const load = async () => {
    let query = supabase.from("profiles").select("user_id,username,display_name,created_at,deleted_at").order("created_at", { ascending: false }).limit(100);
    if (q.trim()) query = query.ilike("username", `%${q.trim()}%`);
    const { data } = await query;
    setList((data ?? []) as Profile[]);
    const { data: b } = await supabase.from("user_bans").select("user_id");
    setBans(new Set((b ?? []).map((r) => r.user_id)));
  };
  useEffect(() => { load(); }, [q]);

  const suspend = async (uid: string, days: number | null) => {
    const reason = prompt(days ? `Reason for ${days}-day suspension?` : "Reason for permanent ban?") ?? "";
    if (!user) return;
    const expires = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const { error } = await supabase.from("user_bans").insert({ user_id: uid, banned_by: user.id, reason, expires_at: expires });
    if (error) { toast.error(error.message); return; }
    toast.success(days ? `Suspended for ${days} days` : "User banned");
    load();
  };
  const unban = async (uid: string) => {
    const { error } = await supabase.from("user_bans").delete().eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("User unbanned");
    load();
  };
  const deleteAllVideos = async (uid: string) => {
    if (!confirm("Delete ALL videos by this user?")) return;
    const { error } = await supabase.from("videos").delete().eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Videos deleted");
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

  return (
    <div className="space-y-3">
      <Input placeholder="Search by username…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((p) => {
        const banned = bans.has(p.user_id);
        const deleted = !!p.deleted_at;
        return (
          <div key={p.user_id} className="rounded-2xl border border-border p-3 flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                @{p.username}
                {banned && <span className="text-destructive text-xs"> (suspended)</span>}
                {deleted && <span className="text-muted-foreground text-xs"> (deleted)</span>}
              </p>
              <p className="text-xs text-muted-foreground truncate">{p.display_name}</p>
            </div>
            <Link to="/u/$username" params={{ username: p.username }}>
              <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </Link>
            {banned ? (
              <Button size="sm" variant="outline" onClick={() => unban(p.user_id)}>
                <ShieldOff className="h-3.5 w-3.5 mr-1" /> Lift
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => suspend(p.user_id, 7)} title="Suspend 7 days">
                  <Clock className="h-3.5 w-3.5 mr-1" /> 7d
                </Button>
                <Button size="sm" variant="outline" onClick={() => suspend(p.user_id, 30)} title="Suspend 30 days">
                  <Clock className="h-3.5 w-3.5 mr-1" /> 30d
                </Button>
                <Button size="sm" variant="destructive" onClick={() => suspend(p.user_id, null)}>
                  <Ban className="h-3.5 w-3.5 mr-1" /> Ban
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => deleteAllVideos(p.user_id)} title="Delete all their videos">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            {!deleted && (
              <Button size="sm" variant="ghost" onClick={() => deleteAccount(p.user_id)} title="Delete account" className="text-destructive hover:text-destructive">
                <UserX className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
      {list.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
    </div>
  );
}