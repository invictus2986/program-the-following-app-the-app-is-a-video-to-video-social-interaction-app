import { supabase } from "@/integrations/supabase/client";

const R2_UPLOAD_ENDPOINT = "https://upload.jaiff.com/upload";

/**
 * Derives the Cloudflare R2 object key from a stored `storage_path`.
 * New uploads store the full public playback URL; legacy rows store a
 * Supabase Storage path and have no R2 object (returns null).
 */
export function r2KeyFromStoragePath(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  if (!storagePath.startsWith("https://")) return null;
  try {
    const url = new URL(storagePath);
    const key = url.pathname.replace(/^\/+/, "");
    if (!key) return null;
    return key
      .split("/")
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      })
      .join("/");
  } catch {
    return null;
  }
}

/**
 * Deletes a single R2 object owned by the signed-in user.
 * The Worker verifies the bearer token and that the key lives under the
 * caller's own `<uid>/` prefix. Never throws: a failed cleanup must not
 * make an already-completed database deletion look like a failure.
 */
export async function deleteOwnR2Object(storagePath: string | null | undefined): Promise<boolean> {
  const key = r2KeyFromStoragePath(storagePath);
  if (!key) return false;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const res = await fetch(`${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
