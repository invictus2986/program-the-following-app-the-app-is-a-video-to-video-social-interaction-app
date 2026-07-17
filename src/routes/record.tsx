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

const R2_UPLOAD_ENDPOINT = "https://upload.jaiff.com/upload";

async function uploadToR2(
file: Blob,
filename: string,
accessToken: string
): Promise<string> {
  console.log(
    "Uploading to:",
    `${R2_UPLOAD_ENDPOINT}?filename=${encodeURIComponent(filename)}`
  );

  const res = await fetch(
    `${R2_UPLOAD_ENDPOINT}?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
		"Authorization": `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }

  const { fileUrl } = (await res.json()) as {
    fileUrl: string;
    key?: string;
  };

  if (!fileUrl) {
    throw new Error("Upload response missing fileUrl");
  }

  return fileUrl;
}

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
      const onSeeked = () => {
        try {
          const w = v.videoWidth || 720;
          const h = v.videoHeight || 1280;
          const max = 720;
          const scale = Math.min(1, max / Math.max(w, h));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return fail();
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((b) => { cleanup(); resolve(b); }, "image/jpeg", 0.8);
        } catch {
          fail();
        }
      };
      v.onseeked = onSeeked;
      try { v.currentTime = target; } catch { fail(); }
    };
  });
}

type Search = { replyTo?: string; parentReplyId?: string };

export const Route = createFileRoute("/record")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    replyTo: typeof s.replyTo === "string" ? s.replyTo : undefined,
    parentReplyId: typeof s.parentReplyId === "string" ? s.parentReplyId : undefined,
  }),
  component: RecordPage,
});

function RecordPage() {
console.log("RECORD PAGE LOADED");
  const { replyTo, parentReplyId } = Route.useSearch();
  const isReply = !!replyTo;
  const maxSeconds = isReply ? 3 * 60 : 5 * 60;
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const drawStopRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

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
    if (!streamRef.current || !videoRef.current) return;
    const videoEl = videoRef.current;
    const w = videoEl.videoWidth || 720;
    const h = videoEl.videoHeight || 1280;

    // Composite the camera feed onto a canvas so we can burn a "Jaiff"
    // watermark into every recorded frame.
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Recording isn't supported in this browser.");
      return;
    }
    drawStopRef.current = false;
    const drawFrame = () => {
      if (drawStopRef.current) return;
      try {
        ctx.drawImage(videoEl, 0, 0, w, h);
        const fontSize = Math.max(14, Math.round(h * 0.028));
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.textAlign = "right";
        const x = w - Math.round(fontSize * 0.7);
        const y = h - Math.round(fontSize * 0.5);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillText("Jaiff", x + 1, y + 1);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText("Jaiff", x, y);
      } catch {
        // ignore transient draw errors (e.g. video not ready)
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const canvasStream = canvas.captureStream(30);
    streamRef.current.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    // Compression: cap bitrate to keep files small without re-encoding.
    // ~1.5 Mbps video + 96 kbps audio ≈ 12 MB / minute (vs 40-80 MB uncompressed).
    const rec = new MediaRecorder(canvasStream, {
      mimeType: mime,
      videoBitsPerSecond: 1_500_000,
      audioBitsPerSecond: 96_000,
    });
    recorderRef.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      drawStopRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
      const rand = Math.random().toString(36).slice(2, 8);
      const filename = `${folder}/${Date.now()}-${rand}.${ext}`;
      // storage_path now holds the full R2 playback URL for new uploads.
     if (!session?.access_token) {
	 throw new Error("You must be logged in to upload");
	 }
	 
	  const path = await uploadToR2(
	  blob, 
	  filename,
	  session?.access_token || ""
	  );

      // Capture thumbnail from a real frame (~1s in) and upload as JPEG.
      let thumbnailUrl: string | null = null;
      try {
        const thumb = await captureThumbnail(blob);
        if (thumb) {
          const thumbName = `${folder}/thumbs/${Date.now()}-${rand}.jpg`;
          thumbnailUrl = await uploadToR2(
		  thumb,
		  thumbName,
		  session?.access_token || ""
		  );
        }
      } catch {
        // Non-fatal: video still posts without a thumbnail.
      }

      if (isReply) {
        const { data: rep, error } = await supabase.from("replies").insert({
          video_id: replyTo!,
          user_id: user.id,
          storage_path: path,
          duration_seconds: elapsed,
          parent_reply_id: parentReplyId ?? null,
        }).select("id").maybeSingle();
        if (error) throw error;
        if (!rep) throw new Error("Reply was saved but could not be read back.");
        try {
          const { recordPostIp } = await import("@/lib/moderation.functions");
          await recordPostIp({ data: { replyId: rep.id } });
        } catch {}
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
            thumbnail_url: thumbnailUrl,
          })
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Video was saved but could not be read back.");
        try {
          const { recordPostIp } = await import("@/lib/moderation.functions");
          await recordPostIp({ data: { videoId: data.id } });
        } catch {}
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
          {isReply ? "Up to 3 minutes." : "Up to 5 minutes. Add hashtags so people find you."}
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
