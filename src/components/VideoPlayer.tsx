import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, MessageSquare, UserCheck, UserPlus, User, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Volume2, VolumeX, Layers, Play, Pause, Video as VideoIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { attachProfiles, formatCount, publicUrl } from "@/lib/video";
import { Button } from "@/components/ui/button";
import type { FeedVideo } from "@/components/VideoGrid";

export type PlayerSource =
  | { kind: "list"; videos: FeedVideo[]; startIndex: number }
  | { kind: "search"; videos: FeedVideo[]; startIndex: number }
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

// Fetch the original video (if videoId is a reply, fall back to parent), plus all its replies,
// returned as FeedVideo[] with [original, ...replies].
async function fetchThread(originalVideoId: string, knownOriginal?: FeedVideo): Promise<FeedVideo[]> {
  let original = knownOriginal ?? null;
  if (!original) {
    const { data } = await supabase
      .from("videos")
      .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
      .eq("id", originalVideoId)
      .maybeSingle();
    if (data) {
      const withProfile = await attachProfiles([data as unknown as Omit<FeedVideo, "profiles">]);
      original = withProfile[0];
    }
  }
  const { data: replyRows } = await supabase
    .from("replies")
    .select("id,user_id,storage_path,duration_seconds,created_at")
    .eq("video_id", originalVideoId)
    .order("created_at", { ascending: true });
  const withProfiles = await attachProfiles((replyRows ?? []) as unknown as { user_id: string; id: string; storage_path: string; duration_seconds: number | null; created_at: string }[]);
  const replies: FeedVideo[] = withProfiles.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    storage_path: r.storage_path,
    caption: null,
    hashtags: [],
    duration_seconds: r.duration_seconds,
    views_count: 0,
    likes_count: 0,
    replies_count: 0,
    created_at: r.created_at,
    profiles: r.profiles,
  }));
  return original ? [original, ...replies] : replies;
}

function PlayerOverlay({ source, onClose }: { source: PlayerSource; onClose: () => void }) {
  const [hQueue, setHQueue] = useState<FeedVideo[]>([]);
  const [hIndex, setHIndex] = useState(0);
  // Per horizontal-video thread: originalId -> [original, ...replies]
  const [threads, setThreads] = useState<Record<string, FeedVideo[]>>({});
  // Per horizontal-video active vertical index
  const [vIndices, setVIndices] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  const hContainerRef = useRef<HTMLDivElement>(null);
  const vContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const skipScrollRef = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // For each horizontal slide, the original video id used as the thread key.
  // For "replies" source, every horizontal slide IS the parent; thread key = parent id.
  // For "list" / "search", thread key = the slide's own id (we treat each as the original).
  const threadKeyForIndex = useCallback(
    (i: number): string => {
      const v = hQueue[i];
      if (!v) return "";
      if (source.kind === "replies") return source.parentVideoId;
      return v.id;
    },
    [hQueue, source]
  );

  // Build initial horizontal queue and seed first thread
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      if (source.kind === "replies") {
        // Horizontal queue is just the parent video; vertical thread = [parent, ...replies]
        const thread = await fetchThread(source.parentVideoId);
        if (cancelled) return;
        if (!thread.length) {
          setHQueue([]);
          return;
        }
        const parent = thread[0];
        const clicked = source.videos[source.startIndex];
        // Find vertical index of clicked reply within thread
        const startV = clicked ? Math.max(0, thread.findIndex((t) => t.id === clicked.id)) : 0;
        setHQueue([parent]);
        setThreads({ [parent.id]: thread });
        setVIndices({ [parent.id]: startV });
        setHIndex(0);
      } else if (source.kind === "search") {
        const start = source.videos[source.startIndex];
        const rest = shuffle(source.videos.filter((_, i) => i !== source.startIndex));
        const queue = [start, ...rest];
        if (cancelled) return;
        setHQueue(queue);
        setHIndex(0);
        // seed first thread
        const thread = await fetchThread(start.id, start);
        if (cancelled) return;
        setThreads({ [start.id]: thread });
        setVIndices({ [start.id]: 0 });
      } else {
        const queue = source.videos;
        const start = queue[source.startIndex];
        setHQueue(queue);
        setHIndex(source.startIndex);
        if (start) {
          const thread = await fetchThread(start.id, start);
          if (cancelled) return;
          setThreads({ [start.id]: thread });
          setVIndices({ [start.id]: 0 });
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Lazy-load thread when hIndex changes
  useEffect(() => {
    if (!hQueue.length) return;
    const v = hQueue[hIndex];
    if (!v) return;
    const key = threadKeyForIndex(hIndex);
    if (threads[key]) return;
    let cancelled = false;
    (async () => {
      const thread = await fetchThread(key, source.kind === "replies" ? undefined : v);
      if (cancelled) return;
      setThreads((prev) => ({ ...prev, [key]: thread }));
      setVIndices((prev) => ({ ...prev, [key]: 0 }));
    })();
    return () => {
      cancelled = true;
    };
  }, [hIndex, hQueue, threads, threadKeyForIndex, source.kind]);

  // Initial scroll positioning
  useEffect(() => {
    if (!ready) return;
    const c = hContainerRef.current;
    if (!c) return;
    skipScrollRef.current = true;
    c.scrollTo({ left: hIndex * c.clientWidth, behavior: "auto" });
    setTimeout(() => (skipScrollRef.current = false), 50);
  }, [ready]);

  // When hIndex changes programmatically, scroll horizontal container; also scroll vertical to active vIndex
  useEffect(() => {
    const c = hContainerRef.current;
    if (!c) return;
    const targetLeft = hIndex * c.clientWidth;
    if (Math.abs(c.scrollLeft - targetLeft) > 2) {
      skipScrollRef.current = true;
      c.scrollTo({ left: targetLeft, behavior: "smooth" });
      setTimeout(() => (skipScrollRef.current = false), 400);
    }
    const key = threadKeyForIndex(hIndex);
    const vc = vContainerRefs.current[key];
    const vi = vIndices[key] ?? 0;
    if (vc) {
      const targetTop = vi * vc.clientHeight;
      if (Math.abs(vc.scrollTop - targetTop) > 2) {
        vc.scrollTo({ top: targetTop, behavior: "auto" });
      }
    }
  }, [hIndex, vIndices, threadKeyForIndex]);

  // ESC + arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setHIndex((i) => Math.min(i + 1, hQueue.length - 1));
      if (e.key === "ArrowLeft") setHIndex((i) => Math.max(i - 1, 0));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const key = threadKeyForIndex(hIndex);
        const thread = threads[key] ?? [];
        const cur = vIndices[key] ?? 0;
        const next = e.key === "ArrowDown" ? Math.min(cur + 1, thread.length - 1) : Math.max(cur - 1, 0);
        setVIndices((prev) => ({ ...prev, [key]: next }));
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, hQueue.length, hIndex, vIndices, threads, threadKeyForIndex]);

  const onHScroll = () => {
    if (skipScrollRef.current) return;
    const c = hContainerRef.current;
    if (!c) return;
    const newIdx = Math.round(c.scrollLeft / c.clientWidth);
    if (newIdx !== hIndex && newIdx >= 0 && newIdx < hQueue.length) {
      setHIndex(newIdx);
    }
  };

  const onVScroll = (key: string) => {
    if (skipScrollRef.current) return;
    const vc = vContainerRefs.current[key];
    if (!vc) return;
    const thread = threads[key] ?? [];
    const newIdx = Math.round(vc.scrollTop / vc.clientHeight);
    if (newIdx >= 0 && newIdx < thread.length && newIdx !== (vIndices[key] ?? 0)) {
      setVIndices((prev) => ({ ...prev, [key]: newIdx }));
    }
  };

  if (!hQueue.length) return null;

  const activeKey = threadKeyForIndex(hIndex);
  const activeThread = threads[activeKey] ?? [hQueue[hIndex]];
  const activeVIndex = vIndices[activeKey] ?? 0;
  const currentVideo = activeThread[activeVIndex] ?? hQueue[hIndex];
  const originalVideoId = activeKey;

  const goRecordReply = () => {
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (!currentVideo) return;
    onClose();
    navigate({ to: "/record", search: { replyTo: currentVideo.id } });
  };

  const goPrevH = () => setHIndex((i) => Math.max(0, i - 1));
  const goNextH = () => setHIndex((i) => Math.min(hQueue.length - 1, i + 1));
  const goPrevV = () => setVIndices((prev) => ({ ...prev, [activeKey]: Math.max(0, (prev[activeKey] ?? 0) - 1) }));
  const goNextV = () =>
    setVIndices((prev) => ({
      ...prev,
      [activeKey]: Math.min(activeThread.length - 1, (prev[activeKey] ?? 0) + 1),
    }));

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-30 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute top-4 right-16 z-30 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
      <button
        onClick={goRecordReply}
        className="absolute top-4 right-28 z-30 h-10 w-10 grid place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 backdrop-blur shadow-[var(--shadow-elev)]"
        aria-label="Record video reply"
        title="Record a video reply"
      >
        <VideoIcon className="h-5 w-5" />
      </button>

      {/* Horizontal arrows */}
      {hIndex > 0 && (
        <button
          onClick={goPrevH}
          className="absolute top-1/2 left-4 -translate-y-1/2 z-30 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
          aria-label="Previous video"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {hIndex < hQueue.length - 1 && (
        <button
          onClick={goNextH}
          className="absolute top-1/2 right-4 -translate-y-1/2 z-30 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
          aria-label="Next video"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Vertical arrows for thread */}
      {activeVIndex > 0 && (
        <button
          onClick={goPrevV}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
          aria-label="Previous in thread"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
      {activeVIndex < activeThread.length - 1 && (
        <button
          onClick={goNextV}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
          aria-label="Next in thread"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {/* Thread position indicator */}
      {activeThread.length > 1 && (
        <div className="absolute top-1/2 right-4 -translate-y-1/2 z-20 flex flex-col gap-1.5">
          {activeThread.map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all ${
                i === activeVIndex ? "h-6 bg-white" : "h-3 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}

      {/* Horizontal scroll container */}
      <div
        ref={hContainerRef}
        onScroll={onHScroll}
        className="h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex no-scrollbar"
      >
        {hQueue.map((v, hi) => {
          const key = source.kind === "replies" ? source.parentVideoId : v.id;
          const thread = threads[key] ?? [v];
          const vi = vIndices[key] ?? 0;
          return (
            <div
              key={`${v.id}-${hi}`}
              className="h-full w-screen flex-shrink-0 snap-start snap-always"
            >
              <div
                ref={(el) => {
                  vContainerRefs.current[key] = el;
                }}
                onScroll={() => onVScroll(key)}
                className="h-full w-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar"
              >
                {thread.map((tv, vIdx) => (
                  <div key={`${tv.id}-${vIdx}`} className="h-screen w-full snap-start snap-always">
                    <Slide
                      video={tv}
                      active={hi === hIndex && vIdx === vi}
                      muted={muted}
                      onClose={onClose}
                      threadVideoId={originalVideoId}
                      isOriginal={vIdx === 0}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Slide({
  video,
  active,
  muted,
  onClose,
  threadVideoId,
  isOriginal,
}: {
  video: FeedVideo;
  active: boolean;
  muted: boolean;
  onClose: () => void;
  threadVideoId: string;
  isOriginal: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likes_count);
  const [following, setFollowing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    setLikeCount(video.likes_count);
  }, [video.id, video.likes_count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.currentTime = 0;
      el.play().catch(() => {});
      supabase.from("video_views").insert({ video_id: video.id, user_id: user?.id ?? null });
    } else {
      el.pause();
    }
  }, [active, video.id, user?.id]);

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

  const togglePlay = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
    setShowIndicator(true);
    setTimeout(() => setShowIndicator(false), 600);
  };

  const openThread = () => {
    onClose();
    navigate({ to: "/v/$videoId", params: { videoId: threadVideoId } });
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
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {showIndicator && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-20 w-20 grid place-items-center rounded-full bg-black/50 text-white backdrop-blur animate-in fade-in zoom-in duration-200">
            {playing ? <Play className="h-10 w-10 fill-current" /> : <Pause className="h-10 w-10 fill-current" />}
          </div>
        </div>
      )}
      <button
        onClick={togglePlay}
        className="absolute top-4 left-4 z-20 h-10 w-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>

      {/* Original / Reply badge */}
      <div className="absolute top-4 left-16 z-20 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold backdrop-blur">
        {isOriginal ? "Original" : "Reply"}
      </div>

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
            <button onClick={openProfile} className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 grid place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:scale-105 transition">
                <User className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-semibold max-w-[64px] truncate">
                {video.profiles?.display_name || video.profiles?.username || "Profile"}
              </span>
            </button>
            <button onClick={goReply} className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 grid place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:scale-105 transition">
                <MessageSquare className="h-6 w-6" />
              </div>
              <span className="text-xs font-semibold">{formatCount(video.replies_count)}</span>
            </button>
            <button onClick={openThread} className="flex flex-col items-center gap-1">
              <div className="h-12 w-12 grid place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:scale-105 transition">
                <Layers className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-semibold">Thread</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function fetchVideosByIds(ids: string[]): Promise<FeedVideo[]> {
  if (!ids.length) return [];
  const { data } = await supabase
    .from("videos")
    .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
    .in("id", ids);
  const list = await attachProfiles((data ?? []) as unknown as Omit<FeedVideo, "profiles">[]);
  const byId = new Map(list.map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

if (typeof document !== "undefined" && !document.getElementById("__player_no_scrollbar")) {
  const style = document.createElement("style");
  style.id = "__player_no_scrollbar";
  style.textContent = `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}`;
  document.head.appendChild(style);
}

void useMemo;
