import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Ban, ShieldOff, Trash2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

type Profile = { user_id: string; username: string; display_name: string | null; created_at: string };

function AdminUsers() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Profile[]>([]);
  const [bans, setBans] = useState<Set<string>>(new Set());

  const load = async () => {
    let query = supabase.from("profiles").select("user_id,username,display_name,created_at").order("created_at", { ascending: false }).limit(100);
    if (q.trim()) query = query.ilike("username", `%${q.trim()}%`);
    const { data } = await query;
    setList((data ?? []) as Profile[]);
    const { data: b } = await supabase.from("user_bans").select("user_id");
    setBans(new Set((b ?? []).map((r) => r.user_id)));
  };
  useEffect(() => { load(); }, [q]);

  const ban = async (uid: string) => {
    const reason = prompt("Reason for ban?") ?? "";
    if (!user) return;
    const { error } = await supabase.from("user_bans").insert({ user_id: uid, banned_by: user.id, reason });
    if (error) { toast.error(error.message); return; }
    toast.success("User banned");
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

  return (
    <div className="space-y-3">
      <Input placeholder="Search by username…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((p) => {
        const banned = bans.has(p.user_id);
        return (
          <div key={p.user_id} className="rounded-2xl border border-border p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">@{p.username} {banned && <span className="text-destructive text-xs">(banned)</span>}</p>
              <p className="text-xs text-muted-foreground truncate">{p.display_name}</p>
            </div>
            <Link to="/u/$username" params={{ username: p.username }}>
              <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </Link>
            {banned ? (
              <Button size="sm" variant="outline" onClick={() => unban(p.user_id)}>
                <ShieldOff className="h-3.5 w-3.5 mr-1" /> Unban
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => ban(p.user_id)}>
                <Ban className="h-3.5 w-3.5 mr-1" /> Ban
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => deleteAllVideos(p.user_id)} title="Delete all their videos">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      {list.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
    </div>
  );
}