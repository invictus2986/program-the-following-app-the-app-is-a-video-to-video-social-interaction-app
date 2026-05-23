import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pin, PinOff, Trash2, Video, X } from "lucide-react";
import { Circle, Square, Camera } from "lucide-react";

export const Route = createFileRoute("/admin/announcements")({
  component: AdminAnnouncements,
});

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  created_at: string;
  video_storage_path: string | null;
  video_thumbnail_url: string | null;
  video_duration_seconds: number | null;
};

async function captureThumbnail(videoBlob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoBlob);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    const fail = () => { cleanup(); resolve(null); };
    v.onerror = fail;
    v.onloadedmetadata = () => {
      const target = Math.min(1, (v.duration && isFinite(v.duration) ? v.duration : 1) / 2);
      v.onseeked = () => {
        try {
          const w = v.videoWidth || 720;
          const h = v.videoHeight || 1280;
          const scale = Math.min(1, 720 / Math.max(w, h));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return fail();
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((b) => { cleanup(); resolve(b); }, "image/jpeg", 0.8);
        } catch { fail(); }
      };
      try { v.currentTime = target; } catch { fail(); }
    };
  });
}

async function probeDuration(videoBlob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoBlob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? Math.round(d) : null);
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}

function AdminAnnouncements() {
  const { user } = useAuth();
  const [list, setList] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (liveRef.current) liveRef.current.srcObject = null;
    setStreaming(false);
  };

  useEffect(() => () => { stopCamera(); if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        liveRef.current.muted = true;
        await liveRef.current.play().catch(() => {});
      }
      setStreaming(true);
    } catch (e) {
      toast.error("Couldn't access camera/microphone.");
    }
  };

  const pickMime = (): string => {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return "";
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = pickMime();
    const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      const ext = (rec.mimeType || "").includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `announcement-${Date.now()}.${ext}`, { type: blob.type });
      onPickVideo(file);
      stopCamera();
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= 180) { stopRecording(); }
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("id,title,body,pinned,created_at,video_storage_path,video_thumbnail_url,video_duration_seconds")
      .order("created_at", { ascending: false });
    setList((data ?? []) as Announcement[]);
  };
  useEffect(() => { load(); }, []);

  const onPickVideo = (f: File | null) => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(f);
    setVideoPreview(f ? URL.createObjectURL(f) : null);
  };

  const create = async () => {
    if (!user || !title.trim()) return;
    if (!body.trim() && !videoFile) {
      toast.error("Add a message or a video.");
      return;
    }
    setSaving(true);
    try {
      let video_storage_path: string | null = null;
      let video_thumbnail_url: string | null = null;
      let video_duration_seconds: number | null = null;

      if (videoFile) {
        const ext = videoFile.name.split(".").pop()?.toLowerCase() || (videoFile.type.includes("webm") ? "webm" : "mp4");
        const path = `${user.id}/announcements/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("videos")
          .upload(path, videoFile, { contentType: videoFile.type || "video/mp4", upsert: false });
        if (upErr) throw upErr;
        video_storage_path = path;
        video_duration_seconds = await probeDuration(videoFile);
        try {
          const thumb = await captureThumbnail(videoFile);
          if (thumb) {
            const thumbPath = `${user.id}/announcements/thumbs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
            const { error: tErr } = await supabase.storage
              .from("videos")
              .upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: false });
            if (!tErr) {
              video_thumbnail_url = supabase.storage.from("videos").getPublicUrl(thumbPath).data.publicUrl;
            }
          }
        } catch { /* non-fatal */ }
      }

      const { error } = await supabase.from("announcements").insert({
        title: title.trim(),
        body: body.trim() || null,
        pinned,
        created_by: user.id,
        video_storage_path,
        video_thumbnail_url,
        video_duration_seconds,
      });
      if (error) throw error;
      setTitle(""); setBody(""); setPinned(true);
      onPickVideo(null);
      toast.success("Announcement posted");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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
        <Textarea placeholder="Body (optional if you attach a video)…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} />
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2"><Video className="h-4 w-4" /> Record video announcement (optional)</label>
          <p className="text-xs text-muted-foreground">Record directly from your camera. If attached, this will appear at the top of every user's feed until unpinned. Uploads from your device are not allowed.</p>
          {!videoPreview && (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-w-md">
                <video ref={liveRef} playsInline className="absolute inset-0 h-full w-full object-cover" />
                {!streaming && (
                  <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">
                    Camera off
                  </div>
                )}
                {recording && (
                  <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-600 text-white text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> REC {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,"0")}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {!streaming && (
                  <Button type="button" size="sm" onClick={startCamera}>
                    <Camera className="h-3.5 w-3.5 mr-1" /> Enable camera
                  </Button>
                )}
                {streaming && !recording && (
                  <Button type="button" size="sm" onClick={startRecording} className="bg-rose-600 hover:bg-rose-700 text-white">
                    <Circle className="h-3.5 w-3.5 mr-1 fill-current" /> Start recording
                  </Button>
                )}
                {recording && (
                  <Button type="button" size="sm" variant="outline" onClick={stopRecording}>
                    <Square className="h-3.5 w-3.5 mr-1 fill-current" /> Stop
                  </Button>
                )}
                {streaming && !recording && (
                  <Button type="button" size="sm" variant="ghost" onClick={stopCamera}>Cancel</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Max 3 minutes. Recording stops automatically at the limit.</p>
            </div>
          )}
          {videoPreview && (
            <div className="relative inline-block">
              <video src={videoPreview} controls className="max-h-48 rounded-lg" />
              <button
                type="button"
                onClick={() => onPickVideo(null)}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground grid place-items-center"
                aria-label="Remove video"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin (show at top of every feed)
        </label>
        <Button onClick={create} disabled={saving || !title.trim() || (!body.trim() && !videoFile)}>
          {saving ? "Posting…" : "Post"}
        </Button>
      </div>
      <div className="space-y-3">
        {list.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="font-semibold flex items-center gap-2">
                {a.video_storage_path && <Video className="h-4 w-4 text-primary" />}
                {a.title}
              </h3>
              <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
            </div>
            {a.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words mb-3">{a.body}</p>}
            {a.video_thumbnail_url && (
              <img src={a.video_thumbnail_url} alt="" className="max-h-32 rounded-lg mb-3" />
            )}
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