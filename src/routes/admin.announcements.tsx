import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pin, PinOff, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/announcements")({
  component: AdminAnnouncements,
});

type Announcement = { id: string; title: string; body: string; pinned: boolean; created_at: string };

function AdminAnnouncements() {
  const { user } = useAuth();
  const [list, setList] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("id,title,body,pinned,created_at")
      .order("created_at", { ascending: false });
    setList((data ?? []) as Announcement[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!user || !title.trim() || !body.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(), body: body.trim(), pinned, created_by: user.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setBody(""); setPinned(true);
    toast.success("Announcement posted");
    load();
  };

  const togglePin = async (a: Announcement) => {
    const { error } = await supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border p-4 space-y-3">
        <h2 className="font-semibold">New announcement</h2>
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <Textarea placeholder="Body…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin to home banner
        </label>
        <Button onClick={create} disabled={saving || !title.trim() || !body.trim()}>Post</Button>
      </div>
      <div className="space-y-3">
        {list.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="font-semibold">{a.title}</h3>
              <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words mb-3">{a.body}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => togglePin(a)}>
                {a.pinned ? <><PinOff className="h-3.5 w-3.5 mr-1" /> Unpin</> : <><Pin className="h-3.5 w-3.5 mr-1" /> Pin</>}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => del(a.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No announcements yet.</p>}
      </div>
    </div>
  );
}