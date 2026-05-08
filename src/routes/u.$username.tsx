import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VideoGrid, type FeedVideo } from "@/components/VideoGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { attachProfiles, formatCount } from "@/lib/video";
import { getBlockedUserIds, filterByBlocks } from "@/lib/blocks";
import { usePlayer } from "@/components/VideoPlayer";
import { UserCheck, UserPlus, Pencil, Ban, ShieldOff } from "lucide-react";
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
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const player = usePlayer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [responses, setResponses] = useState<FeedVideo[]>([]);
  // For each response thumbnail, remember which parent video it replies to
  const [responseParents, setResponseParents] = useState<string[]>([]);
  const [liked, setLiked] = useState<FeedVideo[]>([]);
  const [following, setFollowing] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [blockList, setBlockList] = useState<{ user_id: string; username: string; display_name: string | null }[]>([]);

  const openEdit = () => {
    setEditDisplayName(profile?.display_name ?? "");
    setEditBio(profile?.bio ?? "");
    setEditOpen(true);
    void loadBlockList();
  };

  const loadBlockList = async () => {
    if (!user) return;
    const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
    const ids = (data ?? []).map((r: any) => r.blocked_id);
    if (!ids.length) { setBlockList([]); return; }
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id,username,display_name")
      .in("user_id", ids);
    setBlockList((profs ?? []) as any);
  };

  const unblockUser = async (blockedId: string) => {
    if (!user) return;
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId);
    if (error) { toast.error(error.message); return; }
    setBlockList((prev) => prev.filter((p) => p.user_id !== blockedId));
    toast.success("Unblocked");
  };

  const saveProfile = async () => {
    if (!user || !profile) return;
    const name = editDisplayName.trim();
    if (name.length < 1 || name.length > 50) {
      toast.error("Display name must be 1-50 characters");
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name, bio: editBio.trim() || null })
      .eq("user_id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile({ ...profile, display_name: name, bio: editBio.trim() || null });
    await refreshProfile();
    setEditOpen(false);
    toast.success("Profile updated");
  };

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

        // Mutual invisibility: if a block exists either direction, hide profile
        if (user && user.id !== p.user_id) {
          const { data: b } = await supabase
            .from("blocks")
            .select("blocker_id,blocked_id")
            .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${p.user_id}),and(blocker_id.eq.${p.user_id},blocked_id.eq.${user.id})`)
            .limit(1);
          if ((b?.length ?? 0) > 0) {
            // Only the user who *initiated* the block sees it as "blocked" with unblock affordance.
            // Either way, profile content is hidden.
            const iBlockedThem = b!.some((r: any) => r.blocker_id === user.id);
            setBlockedByMe(iBlockedThem);
            setHidden(true);
            setProfile(p as Profile);
            return;
          }
        }
        setHidden(false);
        setBlockedByMe(false);

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

  const blockUser = async () => {
    if (!user || !profile) return navigate({ to: "/auth" });
    if (user.id === profile.user_id) return;
    if (!confirm(`Block @${profile.username}? You'll both become invisible to each other until you unblock them from Edit profile.`)) return;
    // also remove follow relationships in both directions
    await supabase.from("follows").delete().or(
      `and(follower_id.eq.${user.id},following_id.eq.${profile.user_id}),and(follower_id.eq.${profile.user_id},following_id.eq.${user.id})`
    );
    const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: profile.user_id });
    if (error) { toast.error(error.message); return; }
    toast.success(`Blocked @${profile.username}`);
    setBlockedByMe(true);
    setHidden(true);
  };

  const unblockFromProfile = async () => {
    if (!user || !profile) return;
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", profile.user_id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Unblocked @${profile.username}`);
    // reload
    location.reload();
  };

  const openResponseThread = async (idx: number) => {
    const parentId = responseParents[idx];
    if (!parentId) return;
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

  if (!loading && !profile) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-4 py-16 text-muted-foreground">User not found.</div>
      </AppShell>
    );
  }

  if (!loading && profile && hidden) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-4 py-16">
          {blockedByMe ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h1 className="font-display text-2xl font-bold mb-2">You blocked @{profile.username}</h1>
              <p className="text-muted-foreground text-sm mb-4">Their content is hidden from you, and yours from them.</p>
              <Button onClick={unblockFromProfile} variant="outline" className="rounded-full">
                <ShieldOff className="h-4 w-4 mr-1" /> Unblock
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">User not found.</p>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="relative rounded-3xl bg-card border border-border p-6 flex items-center gap-5 shadow-[var(--shadow-elev)]">
          {user && profile && user.id === profile.user_id && (
            <button
              onClick={openEdit}
              className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit profile
            </button>
          )}
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
            <div className="flex flex-col gap-2">
              <Button onClick={toggleFollow} variant={following ? "outline" : "default"} className="rounded-full">
                {following ? <><UserCheck className="h-4 w-4 mr-1" /> Following</> : <><UserPlus className="h-4 w-4 mr-1" /> Follow</>}
              </Button>
              <Button onClick={blockUser} variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive">
                <Ban className="h-4 w-4 mr-1" /> Block
              </Button>
            </div>
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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="dn">Display name</Label>
              <Input id="dn" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} maxLength={50} />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={200} rows={3} />
            </div>
          <div>
            <Label>Blocked users</Label>
            {blockList.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">You haven't blocked anyone.</p>
            ) : (
              <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {blockList.map((b) => (
                  <li key={b.user_id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted">
                    <span>@{b.username}</span>
                    <button onClick={() => unblockUser(b.user_id)} className="text-xs text-primary hover:underline">
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingProfile}>Cancel</Button>
            <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}