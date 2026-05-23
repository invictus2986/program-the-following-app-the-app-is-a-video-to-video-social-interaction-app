import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function extractIp(): string | null {
  const req = getRequest();
  if (!req?.headers) return null;
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr;
  return null;
}

/** Records the caller's IP against a video they just posted, and updates their profile.last_ip. */
export const recordPostIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      videoId: z.string().uuid().optional(),
      replyId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ip = extractIp();
    if (!ip) return { ok: false };
    const { userId } = context;
    if (data.videoId) {
      await supabaseAdmin.from("videos").update({ posted_ip: ip }).eq("id", data.videoId).eq("user_id", userId);
    }
    if (data.replyId) {
      await supabaseAdmin.from("replies").update({ posted_ip: ip }).eq("id", data.replyId).eq("user_id", userId);
    }
    await supabaseAdmin.from("profiles").update({ last_ip: ip }).eq("user_id", userId);
    return { ok: true };
  });

/** Admin-only: returns email + IP info for a user. Gated server-side by the SECURITY DEFINER function. */
export const getAdminUserInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("admin_get_user_info", { _user_id: data.userId });
    if (error) throw new Error(error.message);
    const row = rows?.[0] ?? null;
    if (!row) return null;
    return {
      user_id: row.user_id as string,
      email: row.email as string | null,
      signup_ip: (row.signup_ip as string | null) ?? null,
      last_ip: (row.last_ip as string | null) ?? null,
      created_at: row.created_at as string,
    };
  });

/** Admin-only: returns owner email + IPs for a video. */
export const getAdminVideoInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ videoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("admin_get_video_info", { _video_id: data.videoId });
    if (error) throw new Error(error.message);
    const row = rows?.[0] ?? null;
    if (!row) return null;
    return {
      video_id: row.video_id as string,
      owner_id: row.owner_id as string,
      owner_email: row.owner_email as string | null,
      posted_ip: (row.posted_ip as string | null) ?? null,
      owner_last_ip: (row.owner_last_ip as string | null) ?? null,
      owner_signup_ip: (row.owner_signup_ip as string | null) ?? null,
    };
  });