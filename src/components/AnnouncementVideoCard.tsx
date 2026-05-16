import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Play } from "lucide-react";
import { publicUrl, formatDuration } from "@/lib/video";

type VideoAnnouncement = {
  id: string;
  title: string;
  body: string | null;
  video_storage_path: string;
  video_thumbnail_url: string | null;
  video_duration_seconds: number | null;
};

export function AnnouncementVideoCard() {
  const [a, setA] = useState<VideoAnnouncement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,title,body,video_storage_path,video_thumbnail_url,video_duration_seconds")
        .eq("pinned", true)
        .not("video_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setA(data as VideoAnnouncement);
    })();
  }, []);

  if (!a) return null;
  const src = publicUrl(a.video_storage_path);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full aspect-video sm:aspect-[21/9] overflow-hidden rounded-3xl border-2 border-primary/40 bg-card text-left mb-6 shadow-[var(--shadow-elev)]"
      >
        {a.video_thumbnail_url && (
          <img src={a.video_thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <video
          src={src + "#t=0.1"}
          muted
          playsInline
          preload="none"
          poster={a.video_thumbnail_url ?? undefined}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide">
          <Megaphone className="h-3.5 w-3.5" /> Announcement
        </div>
        {a.video_duration_seconds != null && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold">
            <Play className="h-3 w-3" /> {formatDuration(a.video_duration_seconds)}
          </div>
        )}
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-16 w-16 rounded-full bg-primary/90 grid place-items-center shadow-xl group-hover:scale-110 transition">
            <Play className="h-7 w-7 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 text-white">
          <h3 className="font-display text-lg sm:text-2xl font-bold leading-tight">{a.title}</h3>
          {a.body && <p className="text-sm opacity-90 mt-1 line-clamp-2 max-w-2xl">{a.body}</p>}
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <video
              src={src}
              controls
              autoPlay
              playsInline
              className="w-full rounded-2xl bg-black"
            />
            <div className="mt-3 text-white">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary mb-1">
                <Megaphone className="h-4 w-4" /> Announcement
              </div>
              <h3 className="font-display text-xl font-bold">{a.title}</h3>
              {a.body && <p className="text-sm opacity-80 mt-1 whitespace-pre-wrap">{a.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-white text-black grid place-items-center font-bold shadow-lg"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}