import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { attachProfiles, formatCount } from "@/lib/video";
import { usePlayer } from "@/components/VideoPlayer";
import { UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$username")({
  component: ProfilePage,
});

type Profile = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function ProfilePage() {
  const { username } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const player = usePlayer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [responses, setResponses] = useState<FeedVideo[]>([]);
  // For each response thumbnail, remember which parent video it replies to
  const [responseParents, setResponseParents] = useState<string[]>([]);
  const [liked, setLiked] = useState<FeedVideo[]>([]);
  const [following, setFollowing] = useState(false);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: p, error: profileError } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
        if (profileError) throw profileError;
        if (!p || cancelled) {
          setProfile(null);
          return;
        }

        setProfile(p as Profile);

        const [{ data: v, error: videosError }, { data: r, error: repliesError }, { data: l, error: likesError }, { data: followersRows, error: followersError }, { data: followingRows, error: followingError }] = await Promise.all([
          supabase
            .from("videos")
            .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
            .eq("user_id", p.user_id)
            .order("created_at", { ascending: false }),
          supabase
            .from("replies")
            .select("id,video_id,user_id,storage_path,duration_seconds,created_at")
            .eq("user_id", p.user_id)
            .order("created_at", { ascending: false }),
          supabase
            .from("likes")
            .select("video_id,videos:videos!likes_video_id_fkey(id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at)")
            .eq("user_id", p.user_id)
            .order("created_at", { ascending: false }),
          supabase.from("follows").select("follower_id").eq("following_id", p.user_id),
          supabase.from("follows").select("following_id").eq("follower_id", p.user_id),
        ]);

        if (videosError || repliesError || likesError || followersError || followingError) {
          throw videosError || repliesError || likesError || followersError || followingError;
        }
        if (cancelled) return;

        setVideos(await attachProfiles((v ?? []) as unknown as Omit<FeedVideo, "profiles">[]));
        // Build FeedVideo-shaped rows from replies (the reply itself is the thumbnail)
        const replyRows = (r ?? []).map((x: any) => ({
          id: x.id as string,
          user_id: x.user_id as string,
          storage_path: x.storage_path as string,
          caption: null,
          hashtags: [] as string[],
          duration_seconds: (x.duration_seconds ?? null) as number | null,
          views_count: 0,
          likes_count: 0,
          replies_count: 0,
          created_at: x.created_at as string,
        }));
        setResponses(await attachProfiles(replyRows as Omit<FeedVideo, "profiles">[]));
        setResponseParents((r ?? []).map((x: any) => x.video_id as string));
        setLiked(await attachProfiles(((l ?? []).map((x: any) => x.videos).filter(Boolean)) as Omit<FeedVideo, "profiles">[]));
        setStats({ followers: followersRows?.length ?? 0, following: followingRows?.length ?? 0 });

        if (user) {
          const { data: f, error: followError } = await supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", p.user_id).maybeSingle();
          if (followError) throw followError;
          setFollowing(!!f);
        } else {
          setFollowing(false);
        }
      } catch (error) {
        console.error("Failed to load profile page", error);
        if (!cancelled) {
          setVideos([]);
          setResponses([]);
          setResponseParents([]);
          setLiked([]);

  const openResponseThread = async (idx: number) => {
    const parentId = responseParents[idx];
    if (!parentId) return;
    // Fetch the original video and all of its replies
    const [{ data: parentRow }, { data: replyRows }] = await Promise.all([
      supabase
        .from("videos")
        .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at")
        .eq("id", parentId)
        .maybeSingle(),
      supabase
        .from("replies")
        .select("id,user_id,storage_path,duration_seconds,created_at")
        .eq("video_id", parentId)
        .order("created_at", { ascending: true }),
    ]);
    const replyFeed: Omit<FeedVideo, "profiles">[] = (replyRows ?? []).map((x: any) => ({
      id: x.id,
      user_id: x.user_id,
      storage_path: x.storage_path,
      caption: null,
      hashtags: [],
      duration_seconds: x.duration_seconds ?? null,
      views_count: 0,
      likes_count: 0,
      replies_count: 0,
      created_at: x.created_at,
    }));
    const parentFeed = parentRow ? [parentRow as unknown as Omit<FeedVideo, "profiles">] : [];
    const merged = await attachProfiles([...parentFeed, ...replyFeed]);
    const clickedReplyId = responses[idx]?.id;
    const startIndex = Math.max(0, merged.findIndex((m) => m.id === clickedReplyId));
    player.open({ kind: "list", videos: merged, startIndex });
  };

          toast.error("Couldn't load this profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, user?.id]);

  const toggleFollow = async () => {
    if (!user || !profile) return navigate({ to: "/auth" });
    if (user.id === profile.user_id) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.user_id);
      setFollowing(false);
      setStats((s) => ({ ...s, followers: Math.max(0, s.followers - 1) }));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.user_id });
      setFollowing(true);
      setStats((s) => ({ ...s, followers: s.followers + 1 }));
    }
  };

  if (!loading && !profile) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-4 py-16 text-muted-foreground">User not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-3xl bg-card border border-border p-6 flex items-center gap-5 shadow-[var(--shadow-elev)]">
          <div className="h-20 w-20 rounded-full bg-[image:var(--gradient-mint)] grid place-items-center text-primary-foreground font-bold text-3xl">
            {(profile?.display_name || profile?.username || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl font-bold truncate">{profile?.display_name ?? profile?.username}</h1>
            <p className="text-muted-foreground text-sm">@{profile?.username}</p>
            <div className="flex gap-5 mt-2 text-sm">
              <span><strong>{formatCount(stats.followers)}</strong> <span className="text-muted-foreground">followers</span></span>
              <span><strong>{formatCount(stats.following)}</strong> <span className="text-muted-foreground">following</span></span>
              <span><strong>{videos.length}</strong> <span className="text-muted-foreground">videos</span></span>
            </div>
            {profile?.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
          </div>
          {user && profile && user.id !== profile.user_id && (
            <Button onClick={toggleFollow} variant={following ? "outline" : "default"} className="rounded-full">
              {following ? <><UserCheck className="h-4 w-4 mr-1" /> Following</> : <><UserPlus className="h-4 w-4 mr-1" /> Follow</>}
            </Button>
          )}
        </div>

        <Tabs defaultValue="videos" className="mt-8">
          <TabsList className="rounded-full bg-muted">
            <TabsTrigger value="videos" className="rounded-full">@{profile?.username}'s videos</TabsTrigger>
            <TabsTrigger value="responses" className="rounded-full">Responses</TabsTrigger>
            <TabsTrigger value="liked" className="rounded-full">Liked</TabsTrigger>
          </TabsList>
          <TabsContent value="videos" className="mt-6">
            <VideoGrid
              videos={videos}
              loading={loading}
              emptyHint="No videos posted yet."
              onPlay={(i) => player.open({ kind: "list", videos, startIndex: i })}
            />
          </TabsContent>
          <TabsContent value="responses" className="mt-6">
            <VideoGrid
              videos={responses}
              loading={loading}
              emptyHint="No responses to other videos yet."
              onPlay={(i) => openResponseThread(i)}
            />
          </TabsContent>
          <TabsContent value="liked" className="mt-6">
            <VideoGrid
              videos={liked}
              loading={loading}
              emptyHint="Nothing liked yet."
              onPlay={(i) => player.open({ kind: "list", videos: liked, startIndex: i })}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}