import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Archive, ExternalLink, RotateCcw, Trash2, Search } from "lucide-react";

export const Route = createFileRoute("/admin/archive")({
  component: AdminArchive,
});

type ArchivedVideo = {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  duration_seconds: number | null;
  views_count: number;
  likes_count: number;
  replies_count: number;
  created_at: string;
  deleted_at: string;
  posted_ip: string | null;
  owner_email: string | null;
  owner_username: string | null;
  owner_display_name: string | null;
};

function AdminArchive() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<ArchivedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_search_archived_videos", {
      _email_query: debounced || null,
    });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ArchivedVideo[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [debounced]);

  const restore = async (id: string) => {
    if (!confirm("Restore this video to public view?")) return;
    const { error } = await supabase.from("videos").update({ deleted_at: null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Video restored");
    load();
  };

  const permanentDelete = async (v: ArchivedVideo) => {
    if (!confirm("Permanently delete this archived video? This cannot be undone.")) return;
    const { data: replyRows } = await supabase.from("replies").select("storage_path").eq("video_id", v.id);
    const paths = [v.storage_path, ...((replyRows ?? []).map((r: any) => r.storage_path).filter(Boolean))];
    await supabase.storage.from("videos").remove(paths).catch(() => {});
    const { error } = await supabase.from("videos").delete().eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Permanently deleted");
    load();
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold flex items-center gap-2">
        <Archive className="h-5 w-5" /> Archived videos
      </h2>
      <p className="text-xs text-muted-foreground">
        Videos removed from public view by administrators. Search by the owner's email address or username.
      </p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search by email or username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No archived videos found.</p>
      ) : (
        rows.map((v) => (
          <div key={v.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-sm font-semibold truncate">
                {v.caption || <span className="text-muted-foreground italic">No caption</span>}
              </p>
              <span className="text-xs text-muted-foreground shrink-0">
                archived {new Date(v.deleted_at).toLocaleDateString()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
              <p>
                <span className="font-medium text-foreground">@{v.owner_username ?? "?"}</span>
                {v.owner_display_name && <span> · {v.owner_display_name}</span>}
              </p>
              <p className="font-mono break-all">{v.owner_email ?? "no email"}</p>
              <p>
                {v.views_count} views · {v.likes_count} likes · {v.replies_count} replies
                {v.posted_ip && <> · IP <span className="font-mono">{v.posted_ip}</span></>}
              </p>
              <p>posted {new Date(v.created_at).toLocaleString()}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link to="/v/$videoId" params={{ videoId: v.id }} className="inline-flex">
                <Button size="sm" variant="outline">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => restore(v.id)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
              </Button>
              <Button size="sm" variant="destructive" onClick={() => permanentDelete(v)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete permanently
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}