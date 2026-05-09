import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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