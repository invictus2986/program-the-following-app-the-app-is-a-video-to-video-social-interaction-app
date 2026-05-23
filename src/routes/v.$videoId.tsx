import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { publicUrl, formatDuration, formatCount } from "@/lib/video";
import { Button } from "@/components/ui/button";
import { Heart, Home, MessageSquare, Play, Repeat2, UserPlus, UserCheck, Trash2, Flag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/v/$videoId")({
  component: WatchPage,
  validateSearch: (search: Record<string, unknown>) => ({
    reply: typeof search.reply === "string" ? (search.reply as string) : undefined,
  }),
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
  const { reply: replyParam } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { permissions } = useAdminRole();
  const canManage = permissions.has("manage_users");
  const [video, setVideo] = useState<Video | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [activeReply, setActiveReply] = useState<Reply | null>(null);
  const [endMenu, setEndMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followerStats, setFollowerStats] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<Reply | null>(null);
  const [deletingReply, setDeletingReply] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Load a navigation queue of recent video IDs for swipe nav
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(200);
      setQueue((data ?? []).map((d) => d.id));
    })();
  }, []);

  const goToNeighbor = (direction: 1 | -1) => {
    if (!queue.length) return;
    const idx = queue.indexOf(videoId);
    let nextIdx: number;
    if (idx === -1) {
      nextIdx = 0;
    } else {
      nextIdx = (idx + direction + queue.length) % queue.length;
    }
    const nextId = queue[nextIdx];
    if (!nextId || nextId === videoId) return;
    navigate({ to: "/v/$videoId", params: { videoId: nextId }, search: {} });
  };

  const onSwipeStart = (x: number, y: number) => {
    swipeStart.current = { x, y };
  };
  const onSwipeEnd = (x: number, y: number) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    // swipe left (dx<0) -> next, swipe right (dx>0) -> previous
    goToNeighbor(dx < 0 ? 1 : -1);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data: rawVideo, error: videoError } = await supabase
        .from("videos")
        .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,thumbnail_url")
        .eq("id", videoId)
        .maybeSingle();

      if (videoError) throw videoError;

      if (!rawVideo) {
        setVideo(null);
        setReplies([]);
        return;
      }

      const [
        { data: author },
        { data: rawReplies, error: repliesError },
        { count: followers },
        { count: followingCount },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("username,display_name,avatar_url")
          .eq("user_id", rawVideo.user_id)
          .maybeSingle(),
        supabase
          .from("replies")
          .select("id,user_id,storage_path,duration_seconds,created_at")
          .eq("video_id", videoId)
          .order("created_at", { ascending: false }),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", rawVideo.user_id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", rawVideo.user_id),
      ]);

      if (repliesError) throw repliesError;

      const replyUserIds = Array.from(new Set((rawReplies ?? []).map((reply) => reply.user_id)));
      const { data: replyProfiles } = replyUserIds.length
        ? await supabase
            .from("profiles")
            .select("user_id,username,display_name,avatar_url")
            .in("user_id", replyUserIds)
        : { data: [] };

      const profileByUserId = new Map((replyProfiles ?? []).map((profile) => [profile.user_id, profile]));

      setVideo({
        ...(rawVideo as Omit<Video, "profiles">),
        profiles: author ?? null,
      });
      setReplies(
        ((rawReplies ?? []).map((reply) => ({
          ...reply,
          profiles: profileByUserId.get(reply.user_id)
            ? {
                username: profileByUserId.get(reply.user_id)!.username,
                display_name: profileByUserId.get(reply.user_id)!.display_name,
                avatar_url: profileByUserId.get(reply.user_id)!.avatar_url,
              }
            : null,
        })) as Reply[])
      );
      setFollowerStats({ followers: followers ?? 0, following: followingCount ?? 0 });

      if (user) {
        const [{ data: l }, { data: f }] = await Promise.all([
          supabase.from("likes").select("*").eq("user_id", user.id).eq("video_id", videoId).maybeSingle(),
          supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", rawVideo.user_id).maybeSingle(),
        ]);
        setLiked(!!l);
        setFollowing(!!f);
      } else {
        setLiked(false);
        setFollowing(false);
      }

      supabase.from("video_views").insert({ video_id: videoId, user_id: user?.id ?? null });
    } catch (error) {
      console.error("Failed to load video page", error);
      setVideo(null);
      setReplies([]);
      toast.error("Couldn't load this video.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setEndMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, user?.id]);

  // Sync activeReply with ?reply= search param
  useEffect(() => {
    if (!replyParam) {
      setActiveReply(null);
      return;
    }
    const found = replies.find((r) => r.id === replyParam) ?? null;
    setActiveReply(found);
    setEndMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyParam, replies]);

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

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-6xl mx-auto px-4 py-16 text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!video) {
    return (
      <AppShell>
        <div className="max-w-6xl mx-auto px-4 py-16 text-muted-foreground">This video couldn't be loaded.</div>
      </AppShell>
    );
  }

  const playingReply = !!activeReply;
  const src = playingReply ? publicUrl(activeReply!.storage_path) : publicUrl(video.storage_path);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <div
            className="relative rounded-3xl overflow-hidden bg-black h-[80vh] shadow-[var(--shadow-elev)] touch-pan-y select-none"
            onTouchStart={(e) => {
              const t = e.touches[0];
              onSwipeStart(t.clientX, t.clientY);
            }}
            onTouchEnd={(e) => {
              const t = e.changedTouches[0];
              onSwipeEnd(t.clientX, t.clientY);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") onSwipeStart(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse") onSwipeEnd(e.clientX, e.clientY);
            }}
          >
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
            {user && user.id === video.user_id && (
              <Button onClick={() => setDeleteOpen(true)} variant="outline" className="rounded-full text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
            {user && user.id !== video.user_id && (
              <Button onClick={() => setReportOpen(true)} variant="ghost" className="rounded-full text-muted-foreground">
                <Flag className="h-4 w-4 mr-1" /> Report
              </Button>
            )}
          </div>
        </div>

        <aside>
          <h3 className="font-display text-xl font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> {video.replies_count} {video.replies_count === 1 ? "reply" : "replies"}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {replies.length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet. Be the first to respond — with video.</p>
            )}
            {[...replies]
              .map((r) => ({
                r,
                depth: replies.filter(
                  (x) => x.user_id === r.user_id || x.user_id === video.user_id,
                ).length,
              }))
              .sort((a, b) => b.depth - a.depth)
              .map(({ r, depth: backForth }) => {
              return (
              <button
                key={r.id}
                onClick={() => {
                  navigate({
                    to: "/v/$videoId",
                    params: { videoId: video.id },
                    search: { reply: r.id },
                  });
                }}
                className={`group relative aspect-[9/16] overflow-hidden rounded-2xl border bg-black transition ${activeReply?.id === r.id ? "border-primary" : "border-border hover:border-primary/60"}`}
              >
                <video src={publicUrl(r.storage_path) + "#t=0.1"} muted preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute inset-0 grid place-items-center">
                  <Play className="h-8 w-8 text-white drop-shadow" fill="white" />
                </div>
                {backForth > 1 && (
                  <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold shadow-[var(--shadow-elev)]">
                    +{backForth}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-left">
                  <p className="font-semibold text-xs truncate">@{r.profiles?.username ?? "unknown"}</p>
                  <p className="text-[10px] opacity-80">{formatDuration(r.duration_seconds)}</p>
                </div>
                {canManage && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Delete reply"
                    onClick={(e) => { e.stopPropagation(); setReplyToDelete(r); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setReplyToDelete(r); } }}
                    className="absolute top-2 left-2 h-7 w-7 grid place-items-center rounded-full bg-destructive text-destructive-foreground shadow-[var(--shadow-elev)] hover:bg-destructive/90"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </aside>
      </div>

      <AlertDialog open={!!replyToDelete} onOpenChange={(v) => !v && setReplyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment video?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes only this reply video. The original video and its other replies are kept. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingReply}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingReply}
              onClick={async (e) => {
                e.preventDefault();
                if (!replyToDelete) return;
                setDeletingReply(true);
                try {
                  if (replyToDelete.storage_path) {
                    await supabase.storage.from("videos").remove([replyToDelete.storage_path]).catch(() => {});
                  }
                  const { error } = await supabase.from("replies").delete().eq("id", replyToDelete.id);
                  if (error) throw error;
                  setReplies((prev) => prev.filter((x) => x.id !== replyToDelete.id));
                  if (activeReply?.id === replyToDelete.id) setActiveReply(null);
                  toast.success("Comment video deleted");
                  setReplyToDelete(null);
                } catch (err: any) {
                  toast.error(err.message ?? "Failed to delete");
                } finally {
                  setDeletingReply(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingReply ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the video and its replies. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!user) return;
                setSubmitting(true);
                try {
                  // Best-effort: remove the video file + all reply files from storage
                  const { data: replyRows } = await supabase
                    .from("replies").select("storage_path").eq("video_id", video.id);
                  const paths = [video.storage_path, ...((replyRows ?? []).map((r: any) => r.storage_path).filter(Boolean))];
                  await supabase.storage.from("videos").remove(paths).catch(() => {});
                  // RLS allows the owner OR an admin with manage_users; the trigger
                  // cascades reply rows automatically.
                  const { error } = await supabase.from("videos").delete().eq("id", video.id);
                  if (error) throw error;
                  toast.success("Video deleted");
                  navigate({ to: "/u/$username", params: { username: video.profiles?.username ?? "" } });
                } catch (e: any) {
                  toast.error(e.message ?? "Failed to delete");
                } finally {
                  setSubmitting(false);
                  setDeleteOpen(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this video</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={reportReason} onValueChange={setReportReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inappropriate">Inappropriate content</SelectItem>
                <SelectItem value="harassment">Harassment or bullying</SelectItem>
                <SelectItem value="spam">Spam or misleading</SelectItem>
                <SelectItem value="violence">Violence or dangerous acts</SelectItem>
                <SelectItem value="hate">Hate speech</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Add details (optional)"
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!user) return navigate({ to: "/auth" });
                setSubmitting(true);
                const { error } = await supabase.from("video_reports").insert({
                  video_id: video.id,
                  reporter_id: user.id,
                  reason: reportReason,
                  details: reportDetails || null,
                });
                setSubmitting(false);
                if (error) toast.error(error.message);
                else {
                  toast.success("Report submitted. Thanks for helping keep Wopla safe.");
                  setReportOpen(false);
                  setReportDetails("");
                  setReportReason("inappropriate");
                }
              }}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}