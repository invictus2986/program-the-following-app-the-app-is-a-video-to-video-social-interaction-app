import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { attachProfiles } from "@/lib/video";
import { usePlayer } from "@/components/VideoPlayer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading: authLoading } = useAuth();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

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
        .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (cancelled) return;
      let list = await attachProfiles((data ?? []) as unknown as Omit<FeedVideo, "profiles">[]);
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
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-16">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-semibold">For you</h2>
        </div>
        <VideoGrid
          videos={videos}
          loading={loading}
          emptyHint="No videos yet — be the first to post."
          onPlay={(i) => player.open({ kind: "list", videos, startIndex: i })}
        />
      </section>
    </AppShell>
  );
}
