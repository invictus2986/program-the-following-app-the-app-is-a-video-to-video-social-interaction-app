import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Ban, Flag, UserMinus } from "lucide-react";

export type FollowListMode = "followers" | "following";

type Row = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileUserId: string;
  profileUsername: string;
  mode: FollowListMode;
  isOwnProfile: boolean;
  onChanged?: () => void;
}

export function FollowListDialog({ open, onOpenChange, profileUserId, profileUsername, mode, isOwnProfile, onChanged }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportTarget, setReportTarget] = useState<Row | null>(null);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const col = mode === "followers" ? "follower_id" : "following_id";
        const filterCol = mode === "followers" ? "following_id" : "follower_id";
        const { data: edges, error } = await supabase
          .from("follows")
          .select(`${col}`)
          .eq(filterCol, profileUserId);
        if (error) throw error;
        const ids = (edges ?? []).map((e: any) => e[col]).filter(Boolean);
        if (!ids.length) { if (!cancelled) setRows([]); return; }
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id,username,display_name,avatar_url")
          .in("user_id", ids);
        if (pErr) throw pErr;
        if (!cancelled) setRows((profs ?? []) as Row[]);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load list");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, profileUserId]);

  const unfollow = async (r: Row) => {
    if (!user) return;
    const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", r.user_id);
    if (error) { toast.error(error.message); return; }
    setRows((p) => p.filter((x) => x.user_id !== r.user_id));
    onChanged?.();
    toast.success(`Unfollowed @${r.username}`);
  };

  const block = async (r: Row) => {
    if (!user) return;
    if (!confirm(`Block @${r.username}? You'll both become invisible to each other.`)) return;
    await supabase.from("follows").delete().or(
      `and(follower_id.eq.${user.id},following_id.eq.${r.user_id}),and(follower_id.eq.${r.user_id},following_id.eq.${user.id})`
    );
    const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: r.user_id });
    if (error) { toast.error(error.message); return; }
    setRows((p) => p.filter((x) => x.user_id !== r.user_id));
    onChanged?.();
    toast.success(`Blocked @${r.username}`);
  };

  const submitReport = async () => {
    if (!user || !reportTarget) return;
    setSubmitting(true);
    const { error } = await supabase.from("user_reports").insert({
      reported_user_id: reportTarget.user_id,
      reporter_id: user.id,
      reason: reportReason,
      details: reportDetails.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Report submitted");
    setReportTarget(null);
    setReportDetails("");
    setReportReason("inappropriate");
  };

  const title = mode === "followers"
    ? (isOwnProfile ? "Your followers" : `@${profileUsername}'s followers`)
    : (isOwnProfile ? "You're following" : `@${profileUsername} is following`);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No one here yet.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
              {rows.map((r) => (
                <li key={r.user_id} className="flex items-center gap-3 py-2">
                  <Link
                    to="/u/$username"
                    params={{ username: r.username }}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80"
                  >
                    <div className="h-9 w-9 rounded-full bg-[image:var(--gradient-mint)] grid place-items-center text-primary-foreground font-bold">
                      {(r.display_name || r.username).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.display_name || r.username}</p>
                      <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
                    </div>
                  </Link>
                  {isOwnProfile && user && r.user_id !== user.id && (
                    <div className="flex items-center gap-1">
                      {mode === "following" && (
                        <Button size="sm" variant="outline" className="rounded-full h-8" onClick={() => unfollow(r)}>
                          <UserMinus className="h-3.5 w-3.5 mr-1" /> Unfollow
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Report" onClick={() => setReportTarget(r)}>
                        <Flag className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Block" onClick={() => block(r)}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reportTarget} onOpenChange={(v) => !v && setReportTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report @{reportTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inappropriate">Inappropriate behavior</SelectItem>
                  <SelectItem value="harassment">Harassment or bullying</SelectItem>
                  <SelectItem value="spam">Spam or scam</SelectItem>
                  <SelectItem value="impersonation">Impersonation</SelectItem>
                  <SelectItem value="hate_speech">Hate speech</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rdet2">Details (optional)</Label>
              <Textarea id="rdet2" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} maxLength={500} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportTarget(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitReport} disabled={submitting}>{submitting ? "Submitting..." : "Submit report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}