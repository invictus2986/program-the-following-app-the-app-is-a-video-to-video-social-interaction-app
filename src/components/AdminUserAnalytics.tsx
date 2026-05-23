import { useEffect, useState } from "react";
import { getAdminUserAnalytics } from "@/lib/moderation.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";

type Data = Awaited<ReturnType<typeof getAdminUserAnalytics>>;

function fmtTime(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function AdminUserAnalytics({ userId }: { userId: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await getAdminUserAnalytics({ data: { userId, days } });
        if (!cancelled) { setData(r); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, days]);

  if (err) return null;

  return (
    <div className="mt-6 rounded-2xl border border-border p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Admin analytics
        </h3>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading || !data ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Time on app" value={fmtTime(data.total_seconds)} />
          <Stat label="Sessions" value={data.sessions} />
          <Stat label="Videos viewed" value={data.videos_viewed} hint={`${data.unique_videos_viewed} unique`} />
          <Stat label="Videos liked" value={data.videos_liked} />
          <Stat label="Replies posted" value={data.videos_replied} />
          <Stat label="Videos posted" value={data.videos_posted} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</div>}
    </div>
  );
}