import { Link } from "@tanstack/react-router";
import { Eye, Heart, MessageSquare, Play } from "lucide-react";
import { publicUrl, formatDuration, formatCount } from "@/lib/video";

export type FeedVideo = {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  hashtags: string[];
  duration_seconds: number | null;
  views_count: number;
  likes_count: number;
  replies_count: number;
  created_at: string;
  thumbnail_url?: string | null;
  promoted_from_deleted_parent?: boolean | null;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export function VideoGrid({
  videos,
  loading,
  emptyHint,
  onPlay,
}: {
  videos: FeedVideo[];
  loading?: boolean;
  emptyHint?: string;
  onPlay?: (index: number) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-[9/16] rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }
  if (!videos.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-16 text-center text-muted-foreground">
        {emptyHint ?? "Nothing here yet."}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {videos.map((v, i) => (
        <VideoCard key={v.id} v={v} onPlay={onPlay ? () => onPlay(i) : undefined} />
      ))}
    </div>
  );
}

function VideoCard({ v, onPlay }: { v: FeedVideo; onPlay?: () => void }) {
  const src = publicUrl(v.storage_path);
  const className =
    "group relative aspect-[9/16] overflow-hidden rounded-2xl bg-card border border-border hover:border-primary/60 transition shadow-[var(--shadow-elev)] text-left";
  const inner = (
    <>
      {v.thumbnail_url ? (
        <img
          src={v.thumbnail_url}
          alt={v.caption ?? "Video thumbnail"}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <video
        src={src + "#t=0.1"}
        muted
        playsInline
        preload="none"
        poster={v.thumbnail_url ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLVideoElement;
          el.preload = "metadata";
          el.play().catch(() => {});
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLVideoElement;
          el.pause();
          el.currentTime = 0;
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur text-[10px] font-semibold text-white">
        <Eye className="h-3 w-3" /> {formatCount(v.views_count)}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur text-[10px] font-semibold text-white">
        <Play className="h-3 w-3" /> {formatDuration(v.duration_seconds)}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-6 w-6 rounded-full bg-primary/30 grid place-items-center text-[10px] font-bold">
            {(v.profiles?.display_name || v.profiles?.username || "?").slice(0, 1).toUpperCase()}
          </div>
          <span className="text-xs font-semibold truncate">@{v.profiles?.username ?? "unknown"}</span>
        </div>
        {v.caption && <p className="text-xs line-clamp-2 opacity-90">{v.caption}</p>}
        <div className="flex items-center gap-3 mt-2 text-[11px] opacity-90">
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {formatCount(v.likes_count)}</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {formatCount(v.replies_count)}</span>
        </div>
      </div>
    </>
  );
  if (onPlay) {
    return (
      <button type="button" onClick={onPlay} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to="/v/$videoId" params={{ videoId: v.id }} className={className}>
      {inner}
    </Link>
  );
}