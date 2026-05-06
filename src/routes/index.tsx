import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading: authLoading } = useAuth();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let followingIds: string[] = [];
      if (user) {
        const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
        followingIds = (f ?? []).map((r) => r.following_id);
      }
      const { data } = await supabase
        .from("videos")
        .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at,profiles:profiles!videos_user_id_fkey(username,display_name,avatar_url)")
        .order("created_at", { ascending: false })
        .limit(60);
      if (cancelled) return;
      let list = (data ?? []) as unknown as FeedVideo[];
      if (followingIds.length) {
        list = [
          ...list.filter((v) => followingIds.includes(v.user_id)),
          ...list.filter((v) => !followingIds.includes(v.user_id)),
        ];
      }
      setVideos(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <AppShell>
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-6">
        <div className="flex flex-col items-start gap-4">
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wider uppercase">Video conversations</span>
          <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight leading-[0.95]">
            Reply with your <span className="bg-[image:var(--gradient-mint)] bg-clip-text text-transparent">face</span>,<br />never with words.
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Post a video up to 10 minutes. Anyone can reply — but only with a 5-minute video of their own. No comment threads. No keyboards. Just talking.
          </p>
          {!user && !authLoading && (
            <div className="flex gap-2">
              <Button asChild className="rounded-full font-semibold"><Link to="/auth">Get started</Link></Button>
              <Button asChild variant="outline" className="rounded-full"><Link to="/search">Browse hashtags</Link></Button>
            </div>
          )}
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-semibold">For you</h2>
        </div>
        <VideoGrid videos={videos} loading={loading} emptyHint="No videos yet — be the first to post." />
      </section>
    </AppShell>
  );
}
