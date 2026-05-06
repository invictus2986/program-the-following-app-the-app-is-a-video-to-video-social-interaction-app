import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import { attachProfiles } from "@/lib/video";

type S = { q?: string };

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): S => ({ q: typeof s.q === "string" ? s.q : undefined }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [input, setInput] = useState(q ?? "");
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(q ?? "");
    if (!q) {
      setVideos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const tag = q.replace(/^#/, "").toLowerCase();
      const { data } = await supabase
        .from("videos")
        .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
        .contains("hashtags", [tag])
        .order("created_at", { ascending: false })
        .limit(60);
      if (!cancelled) {
        setVideos(await attachProfiles((data ?? []) as unknown as Omit<FeedVideo, "profiles">[]));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim().replace(/^#/, "");
    if (v) navigate({ to: "/search", search: { q: v } });
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-display text-4xl font-bold mb-1">Search hashtags</h1>
        <p className="text-muted-foreground text-sm mb-6">No keywords. No people search by name. Just tags.</p>
        <form onSubmit={submit} className="relative max-w-xl mb-8">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="#hashtag"
            className="pl-12 h-14 rounded-full text-lg bg-card"
          />
        </form>
        {q && (
          <h2 className="font-display text-xl mb-4">
            Videos tagged <span className="text-primary">#{q.replace(/^#/, "")}</span>
          </h2>
        )}
        <VideoGrid videos={videos} loading={loading} emptyHint={q ? "No videos with that hashtag yet." : "Search for a hashtag above."} />
      </div>
    </AppShell>
  );
}