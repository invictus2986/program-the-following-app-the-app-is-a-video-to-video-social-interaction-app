import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/announcements")({
  component: AnnouncementsPage,
});

type Announcement = { id: string; title: string; body: string; created_at: string };

function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,title,body,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setList((data ?? []) as Announcement[]);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <section className="px-4 pt-8 pb-16 max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" /> Announcements
        </h1>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">No announcements yet.</p>
        ) : (
          <ul className="space-y-4">
            {list.map((a) => (
              <li key={a.id} className="rounded-2xl border border-border p-4 bg-card">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h2 className="font-semibold">{a.title}</h2>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}