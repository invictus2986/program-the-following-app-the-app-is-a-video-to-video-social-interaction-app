import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { useAuth } from "@/lib/auth";
import { attachProfiles } from "@/lib/video";
import { getBlockedUserIds, filterByBlocks } from "@/lib/blocks";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AnnouncementVideoCard } from "@/components/AnnouncementVideoCard";

export const Route = createFileRoute("/")({
  component: Index,
});

const PAGE_SIZE = 30;

function Index() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [topTags, setTopTags] = useState<string[]>([]);
  const tagWeightsRef = useRef<Map<string, number>>(new Map());
  const followingIdsRef = useRef<string[]>([]);
  const blockedRef = useRef<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rankList = (list: FeedVideo[]) => {
    let out = filterByBlocks(list, blockedRef.current);
    out = [...out].sort(() => Math.random() - 0.5);
    if (followingIdsRef.current.length) {
      const f = followingIdsRef.current;
      out = [...out.filter((v) => f.includes(v.user_id)), ...out.filter((v) => !f.includes(v.user_id))];
    }
    if (tagWeightsRef.current.size) {
      const score = (v: FeedVideo) =>
        (v.hashtags ?? []).reduce((s, t) => s + (tagWeightsRef.current.get(t.toLowerCase()) ?? 0), 0);
      out = [...out].sort((a, b) => score(b) - score(a));
    }
    return out;
  };

  const fetchPage = async (pageIndex: number) => {
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("videos")
      .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at,thumbnail_url")
      .order("created_at", { ascending: false })
      .range(from, to);
    const raw = (data ?? []) as unknown as Omit<FeedVideo, "profiles">[];
    const list = await attachProfiles(raw);
    const fresh = list.filter((v) => !seenIdsRef.current.has(v.id));
    fresh.forEach((v) => seenIdsRef.current.add(v.id));
    return { ranked: rankList(fresh), rawCount: raw.length };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      seenIdsRef.current = new Set();
      followingIdsRef.current = [];
      tagWeightsRef.current = new Map();
      blockedRef.current = await getBlockedUserIds(user?.id);
      if (user) {
        const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
        followingIdsRef.current = (f ?? []).map((r) => r.following_id);
        const { data: hist } = await supabase
          .from("search_history")
          .select("tag,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        (hist ?? []).forEach((r, i) => {
          const w = 1 / (1 + i * 0.15);
          tagWeightsRef.current.set(r.tag, (tagWeightsRef.current.get(r.tag) ?? 0) + w);
        });
        const sorted = [...tagWeightsRef.current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
        setTopTags(sorted);
      } else {
        setTopTags([]);
      }
      const { ranked, rawCount } = await fetchPage(0);
      if (cancelled) return;
      setVideos(ranked);
      setPage(0);
      setHasMore(rawCount === PAGE_SIZE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loadingMore || !hasMore) return;
        setLoadingMore(true);
        const next = page + 1;
        const { ranked, rawCount } = await fetchPage(next);
        setVideos((prev) => [...prev, ...ranked]);
        setPage(next);
        setHasMore(rawCount === PAGE_SIZE);
        setLoadingMore(false);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, hasMore, loading, loadingMore]);

  return (
    <AppShell>
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-16">
        <AnnouncementBanner />
        <AnnouncementVideoCard />
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-semibold">For you</h2>
        </div>
        {topTags.length > 0 && (
          <p className="text-xs text-muted-foreground mb-4">
            Tuned to your interests:{" "}
            {topTags.map((t, i) => (
              <span key={t}>
                <Link to="/search" search={{ q: t }} className="text-primary hover:underline">#{t}</Link>
                {i < topTags.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        )}
        <VideoGrid
          videos={videos}
          loading={loading}
          emptyHint="No videos yet — be the first to post."
        />
        <div ref={sentinelRef} className="h-10" />
        {loadingMore && (
          <p className="text-center text-xs text-muted-foreground mt-4">Loading more…</p>
        )}
        {!hasMore && videos.length > 0 && (
          <p className="text-center text-xs text-muted-foreground mt-4">You're all caught up.</p>
        )}
      </section>
    </AppShell>
  );
}