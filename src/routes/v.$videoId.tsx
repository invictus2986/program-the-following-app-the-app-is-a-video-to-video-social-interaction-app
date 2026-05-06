import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { publicUrl, formatDuration, formatCount } from "@/lib/video";
import { Button } from "@/components/ui/button";
import { Heart, Home, MessageSquare, Play, Repeat2, UserPlus, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/v/$videoId")({
  component: WatchPage,
});

type Profile = { username: string; display_name: string | null; avatar_url: string | null };
type Video = {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  hashtags: string[];
  duration_seconds: number | null;
  views_count: number;
  likes_count: number;
  replies_count: number;
  profiles: Profile | null;
};
type Reply = {
  id: string;
  user_id: string;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string;
  profiles: Profile | null;
};

function WatchPage() {
  const { videoId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [video, setVideo] = useState<Video | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [activeReply, setActiveReply] = useState<Reply | null>(null);
  const [endMenu, setEndMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followerStats, setFollowerStats] = useState({ followers: 0, following: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("videos")
      .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,profiles:profiles!videos_user_id_fkey(username,display_name,avatar_url)")
      .eq("id", videoId)
      .maybeSingle();
    setVideo(data as unknown as Video);
    if (data) {
      const { data: r } = await supabase
        .from("replies")
        .select("id,user_id,storage_path,duration_seconds,created_at,profiles:profiles!replies_user_id_fkey(username,display_name,avatar_url)")
        .eq("video_id", videoId)
        .order("created_at", { ascending: false });
      setReplies((r ?? []) as unknown as Reply[]);
      // followers count
      const [{ count: followers }, { count: followingCount }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", data.user_id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", data.user_id),
      ]);
      setFollowerStats({ followers: followers ?? 0, following: followingCount ?? 0 });
      if (user) {
        const [{ data: l }, { data: f }] = await Promise.all([
          supabase.from("likes").select("*").eq("user_id", user.id).eq("video_id", videoId).maybeSingle(),
          supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", data.user_id).maybeSingle(),
        ]);
        setLiked(!!l);
        setFollowing(!!f);
      }
      // Track view
      supabase.from("video_views").insert({ video_id: videoId, user_id: user?.id ?? null });
    }
  };

  useEffect(() => {
    load();
    setEndMenu(false);
    setActiveReply(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, user?.id]);

  const toggleLike = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (liked) {
      await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", videoId);
      setLiked(false);
      setVideo((v) => (v ? { ...v, likes_count: Math.max(0, v.likes_count - 1) } : v));
    } else {
      await supabase.from("likes").insert({ user_id: user.id, video_id: videoId });
      setLiked(true);
      setVideo((v) => (v ? { ...v, likes_count: v.likes_count + 1 } : v));
    }
  };

  const toggleFollow = async () => {
    if (!user || !video) return navigate({ to: "/auth" });
    if (user.id === video.user_id) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", video.user_id);
      setFollowing(false);
      setFollowerStats((s) => ({ ...s, followers: Math.max(0, s.followers - 1) }));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: video.user_id });
      setFollowing(true);
      setFollowerStats((s) => ({ ...s, followers: s.followers + 1 }));
    }
  };

  if (!video) {
    return (
      <AppShell>
        <div className="max-w-6xl mx-auto px-4 py-16 text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  const playingReply = !!activeReply;
  const src = playingReply ? publicUrl(activeReply!.storage_path) : publicUrl(video.storage_path);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div>
          <div className="relative rounded-3xl overflow-hidden bg-black aspect-video shadow-[var(--shadow-elev)]">
            <video
              ref={videoRef}
              key={src}
              src={src}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-contain bg-black"
              onEnded={() => !playingReply && setEndMenu(true)}
              onPlay={() => setEndMenu(false)}
            />
            {endMenu && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm grid place-items-center">
                <div className="text-center space-y-6 p-6">
                  <p className="text-white/80 text-sm tracking-wider uppercase">What now?</p>
                  <div className="flex gap-3 justify-center">
                    <Button size="lg" variant="outline" className="rounded-full" onClick={() => navigate({ to: "/" })}>
                      <Home className="h-5 w-5 mr-2" /> Home
                    </Button>
                    <Button
                      size="lg"
                      className="rounded-full bg-primary text-primary-foreground"
                      onClick={() => navigate({ to: "/record", search: { replyTo: video.id } })}
                    >
                      <Repeat2 className="h-5 w-5 mr-2" /> Reply
                    </Button>
                  </div>
                  <button
                    onClick={() => {
                      setEndMenu(false);
                      videoRef.current?.play();
                    }}
                    className="text-white/60 hover:text-white text-sm flex items-center gap-1 mx-auto"
                  >
                    <Play className="h-4 w-4" /> Watch again
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Bottom panel — 1/5 height area for poster info */}
          <div className="mt-4 rounded-3xl bg-card border border-border p-4 flex items-center gap-4">
            <Link to="/u/$username" params={{ username: video.profiles?.username ?? "" }} className="h-14 w-14 rounded-full bg-[image:var(--gradient-mint)] grid place-items-center text-primary-foreground font-bold text-xl">
              {(video.profiles?.display_name || video.profiles?.username || "?").slice(0, 1).toUpperCase()}
            </Link>
            <div className="flex-1 min-w-0">
              <Link to="/u/$username" params={{ username: video.profiles?.username ?? "" }} className="font-display font-semibold text-lg truncate block hover:text-primary">
                {video.profiles?.display_name ?? video.profiles?.username}
              </Link>
              <div className="text-xs text-muted-foreground flex gap-4">
                <span><strong className="text-foreground">{formatCount(followerStats.followers)}</strong> followers</span>
                <span><strong className="text-foreground">{formatCount(followerStats.following)}</strong> following</span>
              </div>
            </div>
            {user && user.id !== video.user_id && (
              <Button onClick={toggleFollow} variant={following ? "outline" : "default"} className="rounded-full">
                {following ? <><UserCheck className="h-4 w-4 mr-1" /> Following</> : <><UserPlus className="h-4 w-4 mr-1" /> Follow</>}
              </Button>
            )}
          </div>
          {video.caption && <p className="mt-4 text-foreground/90">{video.caption}</p>}
          {video.hashtags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {video.hashtags.map((h) => (
                <Link key={h} to="/search" search={{ q: h }} className="text-primary text-sm hover:underline">#{h}</Link>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={toggleLike} variant={liked ? "default" : "outline"} className="rounded-full">
              <Heart className={`h-4 w-4 mr-1 ${liked ? "fill-current" : ""}`} /> {formatCount(video.likes_count)}
            </Button>
            <Button
              onClick={() => (user ? navigate({ to: "/record", search: { replyTo: video.id } }) : navigate({ to: "/auth" }))}
              className="rounded-full bg-primary text-primary-foreground"
            >
              <Repeat2 className="h-4 w-4 mr-1" /> Reply with video
            </Button>
          </div>
        </div>

        <aside>
          <h3 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> {video.replies_count} {video.replies_count === 1 ? "reply" : "replies"}
          </h3>
          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-2">
            {replies.length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet. Be the first to respond — with video.</p>
            )}
            {replies.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveReply(r)}
                className={`w-full text-left rounded-2xl border p-3 flex items-center gap-3 transition ${activeReply?.id === r.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-card"}`}
              >
                <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-black flex-shrink-0">
                  <video src={publicUrl(r.storage_path) + "#t=0.1"} muted className="h-full w-full object-cover" preload="metadata" />
                  <div className="absolute inset-0 grid place-items-center bg-black/30">
                    <Play className="h-5 w-5 text-white" fill="white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">@{r.profiles?.username ?? "unknown"}</p>
                  <p className="text-xs text-muted-foreground">{formatDuration(r.duration_seconds)}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}