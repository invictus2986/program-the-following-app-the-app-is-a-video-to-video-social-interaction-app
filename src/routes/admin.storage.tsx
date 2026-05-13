import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/storage")({
  component: AdminStorage,
});

type PerUser = { user_id: string; files: number; bytes: number };
type Stats = { total_objects: number; total_bytes: number; per_user: PerUser[] };

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}

function AdminStorage() {
  const [s, setS] = useState<Stats | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_storage_stats");
      if (error) {
        setErr(error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      const stats: Stats = {
        total_objects: Number(row.total_objects ?? 0),
        total_bytes: Number(row.total_bytes ?? 0),
        per_user: (row.per_user ?? []) as PerUser[],
      };
      setS(stats);
      const ids = stats.per_user.map((p) => p.user_id).filter(Boolean);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,username")
          .in("user_id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p) => (map[p.user_id] = p.username));
        setNames(map);
      }
    })();
  }, []);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!s) return <p className="text-sm text-muted-foreground">Loading storage…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-2">Video storage</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border p-4">
            <div className="text-2xl font-semibold">{s.total_objects.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total files</div>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <div className="text-2xl font-semibold">{fmtBytes(s.total_bytes)}</div>
            <div className="text-xs text-muted-foreground">Total stored</div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-2">
          Egress (bandwidth from playback) is billed separately and not shown here. Check
          Lovable Cloud → Settings → Cloud &amp; AI balance for live billing.
        </p>
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2">Top uploaders</h2>
        <ol className="space-y-2">
          {s.per_user.map((u, i) => (
            <li key={u.user_id} className="rounded-xl border border-border p-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
              <span className="flex-1 truncate text-sm">
                @{names[u.user_id] ?? u.user_id.slice(0, 8)}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {u.files} files · {fmtBytes(u.bytes)}
              </span>
            </li>
          ))}
          {s.per_user.length === 0 && (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          )}
        </ol>
      </div>
    </div>
  );
}