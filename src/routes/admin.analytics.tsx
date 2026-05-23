import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminPlatformAvgTime } from "@/lib/moderation.functions";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalytics,
});

type Stats = {
  totalUsers: number;
  totalVideos: number;
  totalReplies: number;
  totalLikes: number;
  totalViews: number;
  active24h: number;
  active7d: number;
  active30d: number;
  newUsers7d: number;
  newVideos7d: number;
  avgVideosPerUser: number;
  avgRepliesPerUser: number;
  avgViewsPerSession: number;
};

function fmtTime(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-1">{hint}</div>}
    </div>
  );
}

function AdminAnalytics() {
  const [s, setS] = useState<Stats | null>(null);
  const [topVideos, setTopVideos] = useState<Array<{ id: string; caption: string | null; views_count: number; likes_count: number }>>([]);
  const [avgTime, setAvgTime] = useState<{ d1?: number; d7?: number; d30?: number } | null>(null);

  useEffect(() => {
    (async () => {
      const now = Date.now();
      const iso = (ms: number) => new Date(now - ms).toISOString();
      const day = 24 * 60 * 60 * 1000;

      const head = (q: ReturnType<typeof supabase.from>) => q;
      const [users, videos, replies, likes, views, a24, a7, a30, nu7, nv7, top] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("videos").select("*", { count: "exact", head: true }),
        supabase.from("replies").select("*", { count: "exact", head: true }),
        supabase.from("likes").select("*", { count: "exact", head: true }),
        supabase.from("video_views").select("*", { count: "exact", head: true }),
        supabase.from("video_views").select("user_id", { count: "exact" }).gte("created_at", iso(day)).not("user_id", "is", null),
        supabase.from("video_views").select("user_id", { count: "exact" }).gte("created_at", iso(7 * day)).not("user_id", "is", null),
        supabase.from("video_views").select("user_id", { count: "exact" }).gte("created_at", iso(30 * day)).not("user_id", "is", null),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", iso(7 * day)),
        supabase.from("videos").select("*", { count: "exact", head: true }).gte("created_at", iso(7 * day)),
        supabase.from("videos").select("id,caption,views_count,likes_count").order("views_count", { ascending: false }).limit(10),
      ]);
      head;

      const uniqueUsers = (rows: { user_id: string | null }[] | null) =>
        new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)).size;

      const totalUsers = users.count ?? 0;
      const totalVideos = videos.count ?? 0;
      const totalReplies = replies.count ?? 0;
      const totalViews = views.count ?? 0;

      setS({
        totalUsers,
        totalVideos,
        totalReplies,
        totalLikes: likes.count ?? 0,
        totalViews,
        active24h: uniqueUsers(a24.data as { user_id: string | null }[] | null),
        active7d: uniqueUsers(a7.data as { user_id: string | null }[] | null),
        active30d: uniqueUsers(a30.data as { user_id: string | null }[] | null),
        newUsers7d: nu7.count ?? 0,
        newVideos7d: nv7.count ?? 0,
        avgVideosPerUser: totalUsers ? +(totalVideos / totalUsers).toFixed(2) : 0,
        avgRepliesPerUser: totalUsers ? +(totalReplies / totalUsers).toFixed(2) : 0,
        avgViewsPerSession: uniqueUsers(a30.data as { user_id: string | null }[] | null)
          ? +(totalViews / Math.max(uniqueUsers(a30.data as { user_id: string | null }[] | null), 1)).toFixed(1)
          : 0,
      });
      setTopVideos((top.data ?? []) as typeof topVideos);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [a1, a7, a30] = await Promise.all([
          getAdminPlatformAvgTime({ data: { days: 1 } }),
          getAdminPlatformAvgTime({ data: { days: 7 } }),
          getAdminPlatformAvgTime({ data: { days: 30 } }),
        ]);
        setAvgTime({ d1: a1.avg_seconds_per_user, d7: a7.avg_seconds_per_user, d30: a30.avg_seconds_per_user });
      } catch {
        setAvgTime({});
      }
    })();
  }, []);

  if (!s) return <p className="text-sm text-muted-foreground">Loading analytics…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-2">Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total users" value={s.totalUsers} />
          <StatCard label="Total videos" value={s.totalVideos} />
          <StatCard label="Total replies" value={s.totalReplies} />
          <StatCard label="Total likes" value={s.totalLikes} />
          <StatCard label="Total views" value={s.totalViews} />
          <StatCard label="Avg videos / user" value={s.avgVideosPerUser} />
          <StatCard label="Avg replies / user" value={s.avgRepliesPerUser} />
          <StatCard label="Avg views / active user" value={s.avgViewsPerSession} hint="Last 30d" />
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2">Activity</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Active users (24h)" value={s.active24h} />
          <StatCard label="Active users (7d)" value={s.active7d} />
          <StatCard label="Active users (30d)" value={s.active30d} />
          <StatCard label="New signups (7d)" value={s.newUsers7d} />
          <StatCard label="New videos (7d)" value={s.newVideos7d} />
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2">Avg time on platform per user</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Last 24h" value={avgTime?.d1 != null ? fmtTime(avgTime.d1) : "…"} />
          <StatCard label="Last 7 days" value={avgTime?.d7 != null ? fmtTime(avgTime.d7) : "…"} />
          <StatCard label="Last 30 days" value={avgTime?.d30 != null ? fmtTime(avgTime.d30) : "…"} />
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2">Top videos</h2>
        <ol className="space-y-2">
          {topVideos.map((v, i) => (
            <li key={v.id} className="rounded-xl border border-border p-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
              <span className="flex-1 truncate text-sm">{v.caption || "(no caption)"}</span>
              <span className="text-xs text-muted-foreground shrink-0">{v.views_count} views · {v.likes_count} likes</span>
            </li>
          ))}
          {topVideos.length === 0 && <p className="text-sm text-muted-foreground">No videos yet.</p>}
        </ol>
      </div>
    </div>
  );
}