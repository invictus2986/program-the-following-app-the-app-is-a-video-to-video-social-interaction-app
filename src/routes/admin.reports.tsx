import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, ExternalLink } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { AdminVideoInfo } from "@/components/AdminUserInfo";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReports,
});

type Report = {
  id: string;
  video_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
};
type ReporterMap = Record<string, { username: string }>;

function AdminReports() {
  const { permissions } = useAdminRole();
  const canManage = permissions.has("manage_users");
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<ReporterMap>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("video_reports")
      .select("id,video_id,reporter_id,reason,details,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as Report[];
    setReports(list);
    const ids = Array.from(new Set(list.map((r) => r.reporter_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username")
        .in("user_id", ids);
      const map: ReporterMap = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = { username: p.username }; });
      setProfiles(map);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const dismiss = async (id: string) => {
    const { error } = await supabase.from("video_reports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Report dismissed");
    load();
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    const { error } = await supabase.from("videos").delete().eq("id", videoId);
    if (error) { toast.error(error.message); return; }
    toast.success("Video deleted");
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading reports…</p>;
  if (reports.length === 0) return <p className="text-sm text-muted-foreground">No reports.</p>;

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border p-4">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-sm font-semibold capitalize">{r.reason.replace(/_/g, " ")}</span>
            <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-1">
            By @{profiles[r.reporter_id]?.username ?? r.reporter_id.slice(0, 8)}
          </p>
          {r.details && <p className="text-sm whitespace-pre-wrap break-words mb-3">{r.details}</p>}
          <AdminVideoInfo videoId={r.video_id} />
          <div className="flex gap-2 flex-wrap">
            <Link to="/v/$videoId" params={{ videoId: r.video_id }} className="inline-flex">
              <Button size="sm" variant="outline">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> View video
              </Button>
            </Link>
            {canManage && (
              <Button size="sm" variant="destructive" onClick={() => deleteVideo(r.video_id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete video
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => dismiss(r.id)}>Dismiss</Button>
          </div>
        </div>
      ))}
    </div>
  );
}