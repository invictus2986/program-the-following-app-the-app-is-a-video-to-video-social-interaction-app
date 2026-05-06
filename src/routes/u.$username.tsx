import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { formatCount } from "@/lib/video";
import { UserCheck, UserPlus } from "lucide-react";

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [responses, setResponses] = useState<FeedVideo[]>([]);
  const [liked, setLiked] = useState<FeedVideo[]>([]);
  const [following, setFollowing] = useState(false);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (!p || cancelled) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(p as Profile);
      const [{ data: v }, { data: r }, { data: l }, { count: f1 }, { count: f2 }] = await Promise.all([
        supabase
          .from("videos")
          .select("id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at,profiles:profiles!videos_user_id_fkey(username,display_name,avatar_url)")
          .eq("user_id", p.user_id)
          .order("created_at", { ascending: false }),
        supabase
          .from("replies")
          .select("video_id,videos:videos!replies_video_id_fkey(id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at,profiles:profiles!videos_user_id_fkey(username,display_name,avatar_url))")
          .eq("user_id", p.user_id)
          .order("created_at", { ascending: false }),
        supabase
          .from("likes")
          .select("video_id,videos:videos!likes_video_id_fkey(id,user_id,storage_path,caption,hashtags,duration_seconds,views_count,likes_count,replies_count,created_at,profiles:profiles!videos_user_id_fkey(username,display_name,avatar_url))")
          .eq("user_id", p.user_id)
          .order("created_at", { ascending: false }),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", p.user_id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", p.user_id),
      ]);
      if (cancelled) return;
      setVideos((v ?? []) as unknown as FeedVideo[]);
      setResponses(((r ?? []).map((x: any) => x.videos).filter(Boolean)) as FeedVideo[]);
      setLiked(((l ?? []).map((x: any) => x.videos).filter(Boolean)) as FeedVideo[]);
      setStats({ followers: f1 ?? 0, following: f2 ?? 0 });
      if (user) {
        const { data: f } = await supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", p.user_id).maybeSingle();
        setFollowing(!!f);
      }
      setLoading(false);
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
            <VideoGrid videos={videos} loading={loading} emptyHint="No videos posted yet." />
          </TabsContent>
          <TabsContent value="responses" className="mt-6">
            <VideoGrid videos={responses} loading={loading} emptyHint="No responses to other videos yet." />
          </TabsContent>
          <TabsContent value="liked" className="mt-6">
            <VideoGrid videos={liked} loading={loading} emptyHint="Nothing liked yet." />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}