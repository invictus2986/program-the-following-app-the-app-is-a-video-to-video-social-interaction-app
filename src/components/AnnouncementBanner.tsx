import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, X } from "lucide-react";

type Announcement = { id: string; title: string; body: string; created_at: string };

export function AnnouncementBanner() {
  const [a, setA] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,title,body,created_at")
        .eq("pinned", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const seen = typeof window !== "undefined" ? localStorage.getItem("dismissed_announcement") : null;
      if (seen === data.id) return;
      setA(data as Announcement);
    })();
  }, []);

  if (!a || dismissed) return null;

  return (
    <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 relative">
      <button
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem("dismissed_announcement", a.id);
          setDismissed(true);
        }}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-muted text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="h-9 w-9 rounded-xl bg-primary/15 grid place-items-center shrink-0">
          <Megaphone className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{a.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{a.body}</p>
          <Link to="/announcements" className="text-xs text-primary hover:underline mt-2 inline-block">
            See all announcements →
          </Link>
        </div>
      </div>
    </div>
  );
}