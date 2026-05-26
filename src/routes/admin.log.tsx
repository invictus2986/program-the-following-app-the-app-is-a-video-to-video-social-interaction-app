import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ScrollText, Trash2, Megaphone, Archive, UserX, Video } from "lucide-react";

export const Route = createFileRoute("/admin/log")({
  component: AdminLog,
});

type LogEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, any>;
  created_at: string;
};

const ACTION_META: Record<string, { label: string; icon: any; tone: string }> = {
  video_archived: { label: "Video archived", icon: Archive, tone: "text-amber-600" },
  video_deleted: { label: "Video deleted", icon: Trash2, tone: "text-destructive" },
  announcement_posted: { label: "Announcement posted", icon: Megaphone, tone: "text-primary" },
  announcement_deleted: { label: "Announcement removed", icon: Megaphone, tone: "text-muted-foreground" },
  account_deleted: { label: "Account deleted", icon: UserX, tone: "text-destructive" },
};

function AdminLog() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("moderation_log")
      .select("id,actor_id,action,target_type,target_id,target_label,details,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    const list = (data ?? []) as LogEntry[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username")
        .in("user_id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = p.username; });
      setActors(map);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      r.action.includes(s) ||
      (r.target_label ?? "").toLowerCase().includes(s) ||
      JSON.stringify(r.details).toLowerCase().includes(s) ||
      (actors[r.actor_id ?? ""] ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold flex items-center gap-2">
        <ScrollText className="h-5 w-5" /> Moderation log
      </h2>
      <p className="text-xs text-muted-foreground">
        Audit trail of admin actions. Removed announcements keep a snapshot of their full content here.
      </p>
      <Input placeholder="Filter by action, user, target…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No log entries.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const meta = ACTION_META[r.action] ?? { label: r.action, icon: Video, tone: "text-foreground" };
            const Icon = meta.icon;
            return (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className={`flex items-center gap-2 text-sm font-semibold ${meta.tone}`}>
                    <Icon className="h-4 w-4" /> {meta.label}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  by <span className="font-mono">@{actors[r.actor_id ?? ""] ?? (r.actor_id ? r.actor_id.slice(0, 8) : "system")}</span>
                  {r.target_label && (
                    <> · target: <span className="font-medium text-foreground break-all">{r.target_label}</span></>
                  )}
                </p>
                {r.action === "announcement_deleted" && r.details?.body && (
                  <div className="mt-2 rounded-lg bg-muted/40 p-2 text-xs">
                    <p className="font-semibold mb-1">{r.details.title}</p>
                    <p className="whitespace-pre-wrap break-words">{r.details.body}</p>
                  </div>
                )}
                {r.action === "video_archived" || r.action === "video_deleted" ? (
                  r.details?.caption && (
                    <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">"{r.details.caption}"</p>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}