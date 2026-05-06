import { supabase } from "@/integrations/supabase/client";

type VideoProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export async function attachProfiles<T extends { user_id: string }>(rows: T[]): Promise<Array<T & { profiles: Omit<VideoProfile, "user_id"> | null }>> {
  if (!rows.length) return rows.map((row) => ({ ...row, profiles: null }));

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data } = await supabase
    .from("profiles")
    .select("user_id,username,display_name,avatar_url")
    .in("user_id", userIds);

  const profileByUserId = new Map<string, Omit<VideoProfile, "user_id">>(
    (data ?? []).map((profile) => [
      profile.user_id,
      {
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    ])
  );

  return rows.map((row) => ({
    ...row,
    profiles: profileByUserId.get(row.user_id) ?? null,
  }));
}

export function publicUrl(path: string) {
  return supabase.storage.from("videos").getPublicUrl(path).data.publicUrl;
}

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/#[\p{L}0-9_]+/gu) ?? [];
  return Array.from(new Set(matches.map((t) => t.slice(1).toLowerCase())));
}

export function formatDuration(s?: number | null) {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}