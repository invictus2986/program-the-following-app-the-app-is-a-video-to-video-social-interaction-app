import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, MessageSquare, Repeat2, UserCheck, UserPlus, X, ChevronUp, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { attachProfiles, formatCount, publicUrl } from "@/lib/video";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FeedVideo } from "@/components/VideoGrid";

export type PlayerSource =
  | { kind: "list"; videos: FeedVideo[]; startIndex: number }
  | { kind: "search"; videos: FeedVideo[]; startIndex: number } // shuffles after first
  | { kind: "replies"; parentVideoId: string; videos: FeedVideo[]; startIndex: number };

type Ctx = { open: (src: PlayerSource) => void; close: () => void };
const PlayerCtx = createContext<Ctx | null>(null);

export function usePlayer() {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error("usePlayer must be used inside PlayerProvider");
  return c;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [src, setSrc] = useState<PlayerSource | null>(null);
  const open = useCallback((s: PlayerSource) => setSrc(s), []);
  const close = useCallback(() => setSrc(null), []);
  return (
    <PlayerCtx.Provider value={{ open, close }}>
      {children}
      {src && <PlayerOverlay source={src} onClose={close} />}
    </PlayerCtx.Provider>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PlayerOverlay({ source, onClose }: { source: PlayerSource; onClose: () => void }) {
  const [queue, setQueue] = useState<FeedVideo[]>([]);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const skipScrollRef = useRef(false);

  // Build queue based on source kind
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (source.kind === "search") {
        const start = source.videos[source.startIndex];
        const rest = shuffle(source.videos.filter((_, i) => i !== source.startIndex));
        if (!cancelled) {
          setQueue([start, ...rest]);
          setIndex(0);
        }
      } else if (source.kind === "replies") {
        // Start with the clicked reply, then play more replies to the same parent
        const start = source.videos[source.startIndex];
        const rest = source.videos.filter((_, i) => i !== source.startIndex);
        if (!cancelled) {
          setQueue([start, ...rest]);
          setIndex(0);
        }
      } else {
        setQueue(source.videos);
        setIndex(source.startIndex);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Scroll to active index when queue/index changes programmatically
  useEffect(() => {
    if (!queue.length) return;
    const el = slideRefs.current[index];
    if (el && containerRef.current) {
      skipScrollRef.current = true;
      el.scrollIntoView({ behavior: "auto", block: "start" });
      setTimeout(() => (skipScrollRef.current = false), 50);
    }
  }, [queue, index]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, queue.length - 1));
      if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, queue.length]);

  // Detect active slide via scroll
  const onScroll = () => {
    if (skipScrollRef.current) return;
    const c = containerRef.current;
    if (!c) return;
    const newIdx = Math.round(c.scrollTop / c.clientHeight);
    if (newIdx !== index && newIdx >= 0 && newIdx < queue.length) {
      setIndex(newIdx);
    }
  };

  if (!queue.length) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute top-4 right-16 z-20 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
      {/* Up / Down arrows */}
      {index > 0 && (
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="absolute top-1/2 left-4 -translate-y-1/2 z-20 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
          aria-label="Previous"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
      {index < queue.length - 1 && (
        <button
          onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))}
          className="absolute bottom-6 left-4 z-20 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
          aria-label="Next"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-full w-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar"
      >
        {queue.map((v, i) => (
          <div
            key={`${v.id}-${i}`}
            ref={(el) => { slideRefs.current[i] = el; }}
            className="h-screen w-full snap-start snap-always"
          >
            <Slide video={v} active={i === index} muted={muted} onClose={onClose} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide({ video, active, muted, onClose }: { video: FeedVideo; active: boolean; muted: boolean; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likes_count);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setLikeCount(video.likes_count);
  }, [video.id, video.likes_count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.currentTime = 0;
      el.play().catch(() => {});
      // log a view
      supabase.from("video_views").insert({ video_id: video.id, user_id: user?.id ?? null });
    } else {
      el.pause();
    }
  }, [active, video.id, user?.id]);

  // Load like + follow status when active
  useEffect(() => {
    if (!active || !user) {
      setLiked(false);
      setFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: l }, { data: f }] = await Promise.all([
        supabase.from("likes").select("*").eq("user_id", user.id).eq("video_id", video.id).maybeSingle(),
        supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", video.user_id).maybeSingle(),
      ]);
      if (cancelled) return;
      setLiked(!!l);
      setFollowing(!!f);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, video.id, video.user_id]);

  const toggleLike = async () => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (liked) {
      await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", video.id);
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("likes").insert({ user_id: user.id, video_id: video.id });
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
  };

  const toggleFollow = async () => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (user.id === video.user_id) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", video.user_id);
      setFollowing(false);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: video.user_id });
      setFollowing(true);
    }
  };

  const goReply = () => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    onClose();
    navigate({ to: "/record", search: { replyTo: video.id } });
  };

  const openProfile = () => {
    if (!video.profiles?.username) return;
    onClose();
    navigate({ to: "/u/$username", params: { username: video.profiles.username } });
  };

  return (
    <div className="relative h-full w-full grid place-items-center">
      <video
        ref={ref}
        src={publicUrl(video.storage_path)}
        playsInline
        muted={muted}
        loop={false}
        className="max-h-full max-w-full object-contain"
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          el.paused ? el.play().catch(() => {}) : el.pause();
        }}
      />
      {/* Bottom info / actions */}
      <div className="absolute inset-x-0 bottom-0 p-5 pb-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white">
        <div className="flex items-end gap-4 max-w-3xl mx-auto">
          <div className="flex-1 min-w-0">
            <button onClick={openProfile} className="flex items-center gap-2 mb-2 hover:opacity-80">
              <div className="h-10 w-10 rounded-full bg-[image:var(--gradient-mint)] grid place-items-center text-primary-foreground font-bold">
                {(video.profiles?.display_name || video.profiles?.username || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">@{video.profiles?.username ?? "unknown"}</div>
              </div>
              {user && user.id !== video.user_id && (
                <Button onClick={(e) => { e.stopPropagation(); toggleFollow(); }} size="sm" variant={following ? "outline" : "default"} className="rounded-full ml-2 h-7 px-3">
                  {following ? <><UserCheck className="h-3 w-3 mr-1" /> Following</> : <><UserPlus className="h-3 w-3 mr-1" /> Follow</>}
                </Button>
              )}
            </button>
            {video.caption && <p className="text-sm opacity-95 line-clamp-3">{video.caption}</p>}
            {video.hashtags?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {video.hashtags.map((h) => (
                  <Link
                    key={h}
                    to="/search"
                    search={{ q: h }}
                    onClick={() => onClose()}
                    className="text-primary-foreground/90 text-xs hover:underline"
                  >
                    #{h}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 items-center">
            <button onClick={toggleLike} className="flex flex-col items-center gap-1">
              <div className={`h-12 w-12 grid place-items-center rounded-full ${liked ? "bg-primary text-primary-foreground" : "bg-white/15 text-white"} backdrop-blur hover:scale-105 transition`}>
                <Heart className={`h-6 w-6 ${liked ? "fill-current" : ""}`} />
              </div>
              <span className="text-xs font-semibold">{formatCount(likeCount)}</span>
            </button>
            <button onClick={goReply} className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 grid place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:scale-105 transition">
                <Repeat2 className="h-6 w-6" />
              </div>
              <span className="text-xs font-semibold">{formatCount(video.replies_count)}</span>
            </button>
            <button
              onClick={() => {
                onClose();
                navigate({ to: "/v/$videoId", params: { videoId: video.id } });
              }}
              className="flex flex-col items-center gap-1"
            >
              <div className="h-12 w-12 grid place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:scale-105 transition">
                <MessageSquare className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-semibold">Open</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to fetch full FeedVideo objects by id list (used to convert Reply rows into playable videos)
export async function fetchVideosByIds(ids: string[]): Promise<FeedVideo[]> {
  if (!ids.length) return [];
  const { data } = await supabase
    .from("videos")
    .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
    .in("id", ids);
  const list = await attachProfiles((data ?? []) as unknown as Omit<FeedVideo, "profiles">[]);
  // preserve order from input ids
  const byId = new Map(list.map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

// Hide scrollbars on overlay container
if (typeof document !== "undefined" && !document.getElementById("__player_no_scrollbar")) {
  const style = document.createElement("style");
  style.id = "__player_no_scrollbar";
  style.textContent = `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}`;
  document.head.appendChild(style);
}

// Suppress unused import warning for useMemo
void useMemo;