import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Circle, Square, Upload, RefreshCw, ArrowLeft } from "lucide-react";
import { extractHashtags } from "@/lib/video";
import { toast } from "sonner";

type Search = { replyTo?: string };

export const Route = createFileRoute("/record")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    replyTo: typeof s.replyTo === "string" ? s.replyTo : undefined,
  }),
  component: RecordPage,
});

function RecordPage() {
  const { replyTo } = Route.useSearch();
  const isReply = !!replyTo;
  const maxSeconds = isReply ? 5 * 60 : 10 * 60;
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [stage, setStage] = useState<"idle" | "recording" | "review">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  };

  const normalizePreviewDuration = (video: HTMLVideoElement) => {
    if (video.duration === Infinity || Number.isNaN(video.duration)) {
      const onTimeUpdate = () => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.currentTime = 0;
      };

      video.addEventListener("timeupdate", onTimeUpdate);
      video.currentTime = 1e9;
    }
  };

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      toast.error("Couldn't access camera/mic. Please grant permission.");
    }
  };

  useEffect(() => {
    if (stage === "idle" && user) initCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, user]);

  useEffect(() => {
    if (stage !== "review" || !previewUrl || !previewRef.current) return;

    const video = previewRef.current;
    video.pause();
    video.srcObject = null;
    video.src = previewUrl;
    video.currentTime = 0;
    video.load();

    const handleLoadedMetadata = () => normalizePreviewDuration(video);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [stage, previewUrl]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    recorderRef.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: mime });
      setBlob(b);
      const url = URL.createObjectURL(b);
      setPreviewUrl(url);
      stopStream();
      setStage("review");
    };
    rec.start(1000);
    setStage("recording");
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        const n = s + 1;
        if (n >= maxSeconds) stopRecording();
        return n;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
    setStage("idle");
  };

  const upload = async () => {
    if (!blob || !user) return;
    setUploading(true);
    try {
      const ext = blob.type.includes("webm") ? "webm" : "mp4";
      const folder = user.id;
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("videos").upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;

      if (isReply) {
        const { error } = await supabase.from("replies").insert({
          video_id: replyTo!,
          user_id: user.id,
          storage_path: path,
          duration_seconds: elapsed,
        });
        if (error) throw error;
        toast.success("Reply posted");
        navigate({ to: "/v/$videoId", params: { videoId: replyTo! } });
      } else {
        const tags = Array.from(new Set([...extractHashtags(caption), ...extractHashtags(hashtagsInput)]));
        const { data, error } = await supabase
          .from("videos")
          .insert({
            user_id: user.id,
            storage_path: path,
            caption: caption || null,
            hashtags: tags,
            duration_seconds: elapsed,
          })
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Posted!");
        navigate({ to: "/v/$videoId", params: { videoId: data.id } });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remaining = Math.max(0, maxSeconds - elapsed);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() =>
            isReply
              ? navigate({ to: "/v/$videoId", params: { videoId: replyTo! } })
              : navigate({ to: ".." as any })
          }
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="font-display text-3xl font-bold mb-1">{isReply ? "Reply with video" : "Post a video"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isReply ? "Up to 5 minutes." : "Up to 10 minutes. Add hashtags so people find you."}
        </p>

        <div className="relative rounded-3xl overflow-hidden bg-black aspect-video shadow-[var(--shadow-elev)]">
          {stage !== "review" ? (
            <video key="camera-preview" ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover scale-x-[-1]" />
          ) : (
            <video
              key={previewUrl ?? "recording-preview"}
              ref={previewRef}
              src={previewUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => normalizePreviewDuration(e.currentTarget)}
              className="absolute inset-0 h-full w-full object-contain bg-black"
            />
          )}
          {stage === "recording" && (
            <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/90 text-destructive-foreground text-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> REC {mm}:{ss}
            </div>
          )}
          {stage === "idle" && (
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-semibold">
              Max {Math.floor(maxSeconds / 60)}:00
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-3">
          {stage === "idle" && (
            <Button onClick={startRecording} size="lg" className="rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold">
              <Circle className="h-5 w-5 mr-2 fill-current" /> Start recording
            </Button>
          )}
          {stage === "recording" && (
            <Button onClick={stopRecording} size="lg" variant="outline" className="rounded-full">
              <Square className="h-5 w-5 mr-2 fill-current" /> Stop
            </Button>
          )}
          {stage === "review" && (
            <>
              <Button onClick={retake} variant="outline" className="rounded-full">
                <RefreshCw className="h-4 w-4 mr-2" /> Retake
              </Button>
              <Button onClick={upload} disabled={uploading} className="rounded-full bg-primary text-primary-foreground font-semibold">
                <Upload className="h-4 w-4 mr-2" /> {uploading ? "Posting…" : "Post video"}
              </Button>
            </>
          )}
        </div>

        {stage === "review" && !isReply && (
          <div className="mt-8 space-y-4">
            <div>
              <Label htmlFor="cap">Caption</Label>
              <Textarea id="cap" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What's this about? You can write #hashtags here too." rows={3} />
            </div>
            <div>
              <Label htmlFor="tags">Hashtags</Label>
              <Input id="tags" value={hashtagsInput} onChange={(e) => setHashtagsInput(e.target.value)} placeholder="#thoughts #firstpost" />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}