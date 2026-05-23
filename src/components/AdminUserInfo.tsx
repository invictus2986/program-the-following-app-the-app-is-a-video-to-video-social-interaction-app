import { useEffect, useState } from "react";
import { getAdminUserInfo, getAdminVideoInfo } from "@/lib/moderation.functions";
import { Mail, Globe } from "lucide-react";

type UserInfo = Awaited<ReturnType<typeof getAdminUserInfo>>;
type VideoInfo = Awaited<ReturnType<typeof getAdminVideoInfo>>;

export function AdminUserInfo({ userId }: { userId: string }) {
  const [info, setInfo] = useState<UserInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getAdminUserInfo({ data: { userId } });
        if (!cancelled) setInfo(r);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);
  if (err) return null;
  if (!info) return <p className="text-xs text-muted-foreground">Loading admin info…</p>;
  return (
    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mb-2 rounded-lg bg-muted/40 px-2 py-1.5">
      {info.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{info.email}</span>}
      {info.last_ip && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />last IP {info.last_ip}</span>}
      {info.signup_ip && info.signup_ip !== info.last_ip && (
        <span className="inline-flex items-center gap-1">signup IP {info.signup_ip}</span>
      )}
    </div>
  );
}

export function AdminVideoInfo({ videoId }: { videoId: string }) {
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getAdminVideoInfo({ data: { videoId } });
        if (!cancelled) setInfo(r);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [videoId]);
  if (err) return null;
  if (!info) return <p className="text-xs text-muted-foreground">Loading admin info…</p>;
  return (
    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mb-2 rounded-lg bg-muted/40 px-2 py-1.5">
      {info.owner_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{info.owner_email}</span>}
      {info.posted_ip && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />posted from {info.posted_ip}</span>}
      {info.owner_last_ip && info.owner_last_ip !== info.posted_ip && (
        <span className="inline-flex items-center gap-1">last IP {info.owner_last_ip}</span>
      )}
    </div>
  );
}