import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const R2_DELETE_ALL_ENDPOINT = "https://upload.jaiff.com/upload/all";
const MAX_R2_ROUNDS = 50;

type WorkerResult = {
  complete: boolean;
  deleted: number;
  failed: string[];
  cursor?: string;
  error?: string;
};

/**
 * Permanently deletes the *authenticated caller's own* account.
 * The user id is taken exclusively from the verified server-side auth context;
 * nothing about the identity is accepted from the browser.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // ---- 1/2. Identity comes only from the authenticated context. ----
    if (!userId) throw new Error("Not authenticated.");

    // ---- 3. Super admin protection BEFORE any deletion happens. ----
    const { data: isSuper, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (roleErr) {
      throw new Error("Could not verify account permissions. Please try again.");
    }
    if (isSuper) {
      throw new Error(
        "Administrator accounts cannot be deleted through self-service account deletion. Contact support to have this account removed.",
      );
    }

    const secret = process.env["R2_DELETE_SECRET"];
    if (!secret) {
      throw new Error("Account deletion is temporarily unavailable. Please try again later.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- 4. Hide the account immediately (audit trigger fires). Idempotent. ----
    await supabaseAdmin
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("deleted_at", null);

    // ---- 5/6. Delete every R2 object under `${uid}/`, following pagination. ----
    let cursor: string | undefined;
    let totalDeleted = 0;
    for (let round = 0; round < MAX_R2_ROUNDS; round++) {
      let result: WorkerResult;
      try {
        const res = await fetch(R2_DELETE_ALL_ENDPOINT, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-delete-secret": secret,
          },
          body: JSON.stringify({ uid: userId, ...(cursor ? { cursor } : {}) }),
        });
        if (!res.ok) {
          throw new Error(`storage responded ${res.status}`);
        }
        result = (await res.json()) as WorkerResult;
      } catch (err) {
        console.error("deleteMyAccount: R2 cleanup failed", err);
        // ---- 7. Never delete Auth after an incomplete storage pass. ----
        throw new Error(
          "Account deletion could not be completed while removing your videos. Some data may already have been removed. Please retry account deletion.",
        );
      }

      totalDeleted += result.deleted ?? 0;

      if (result.failed?.length || result.error) {
        console.error("deleteMyAccount: R2 reported failures", {
          failed: result.failed?.length ?? 0,
          error: result.error,
        });
        throw new Error(
          "Account deletion could not be completed because some of your videos could not be removed. Please retry account deletion.",
        );
      }

      if (result.complete) {
        cursor = undefined;
        break;
      }
      if (!result.cursor) {
        throw new Error(
          "Account deletion could not be completed while removing your videos. Please retry account deletion.",
        );
      }
      cursor = result.cursor;
      if (round === MAX_R2_ROUNDS - 1) {
        throw new Error(
          "Account deletion is taking longer than expected. Some data has already been removed — please retry account deletion.",
        );
      }
    }

    // ---- 5b. Legacy Supabase Storage objects live under the same `${uid}/` prefix. ----
    try {
      const { data: legacy } = await supabaseAdmin.storage.from("videos").list(userId, { limit: 1000 });
      const paths = (legacy ?? []).map((o) => `${userId}/${o.name}`);
      if (paths.length) {
        const { error } = await supabaseAdmin.storage.from("videos").remove(paths);
        if (error) throw new Error(error.message);
      }
    } catch (err) {
      console.error("deleteMyAccount: legacy storage cleanup failed", err);
      throw new Error(
        "Account deletion could not be completed while removing your videos. Please retry account deletion.",
      );
    }

    // ---- 8. Manually-managed rows without FK cascades. Scoped strictly to this user. ----
    const cleanups: Array<Promise<{ error: unknown }>> = [
      supabaseAdmin.from("search_history").delete().eq("user_id", userId) as never,
      supabaseAdmin.from("blocks").delete().eq("blocker_id", userId) as never,
      supabaseAdmin.from("blocks").delete().eq("blocked_id", userId) as never,
      supabaseAdmin.from("notifications").delete().eq("user_id", userId) as never,
      supabaseAdmin.from("notifications").delete().eq("actor_id", userId) as never,
      supabaseAdmin.from("video_reports").delete().eq("reporter_id", userId) as never,
      supabaseAdmin.from("user_reports").delete().eq("reporter_id", userId) as never,
      supabaseAdmin.from("user_reports").delete().eq("reported_user_id", userId) as never,
      supabaseAdmin.from("admin_permissions").delete().eq("user_id", userId) as never,
      supabaseAdmin.from("user_roles").delete().eq("user_id", userId) as never,
    ];
    const results = await Promise.all(cleanups);
    const dbFailed = results.filter((r) => r?.error);
    if (dbFailed.length) {
      console.error("deleteMyAccount: db cleanup failed", dbFailed.map((r) => r.error));
      throw new Error(
        "Account deletion could not be completed while removing your account data. Please retry account deletion.",
      );
    }
    // user_bans and moderation_log are intentionally retained for platform integrity.

    // ---- 9/10. Delete the Auth user; an already-missing user counts as done. ----
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) {
      const msg = (authErr.message || "").toLowerCase();
      const missing = msg.includes("not found") || (authErr as { status?: number }).status === 404;
      if (!missing) {
        console.error("deleteMyAccount: auth delete failed", authErr);
        throw new Error(
          "Account deletion could not be completed. Please retry account deletion.",
        );
      }
    }

    // ---- 11. Success only once every required step succeeded. ----
    return { ok: true as const, objectsDeleted: totalDeleted };
  });
