import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
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

/** Raised when storage could not be reached / refused the request before deleting anything. */
class StorageUnavailableError extends Error {}
/** Raised after storage confirmed at least one deletion but could not finish. */
class StoragePartialError extends Error {}


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

    // The caller's own bearer token, forwarded to the Worker on every request
    // (including cursor continuations) so the Worker can require sub === uid.
    const accessToken = (getRequest().headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      throw new Error("Your session could not be verified. Please sign in again and retry.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- 4. Hide the account immediately (audit trigger fires). Idempotent. ----
    const { error: softDeleteErr } = await supabaseAdmin
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (softDeleteErr) {
      console.error("deleteMyAccount: profile soft-delete failed", softDeleteErr);
      throw new Error(
        "Account deletion could not be started. Nothing has been deleted. Please retry account deletion.",
      );
    }

    // ---- 5/6. Delete every R2 object under `${uid}/`, following pagination. ----
    let cursor: string | undefined;
    let totalDeleted = 0;
    try {
      for (let round = 0; round < MAX_R2_ROUNDS; round++) {
        let result: WorkerResult;
        try {
          const res = await fetch(R2_DELETE_ALL_ENDPOINT, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "x-delete-secret": secret,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ uid: userId, ...(cursor ? { cursor } : {}) }),
          });
          if (!res.ok) {
            const detail = `storage responded ${res.status}`;
            // Endpoint missing / unauthorized / server error: nothing was deleted in this pass.
            throw new StorageUnavailableError(detail);
          }
          result = (await res.json()) as WorkerResult;
        } catch (err) {
          console.error("deleteMyAccount: R2 cleanup failed", err);
          // ---- 7. Never delete Auth after an incomplete storage pass. ----
          if (err instanceof StorageUnavailableError && totalDeleted === 0) {
            throw new StorageUnavailableError(
              "Account deletion could not be started because the video storage service is unavailable. Nothing has been deleted. Please try again later.",
            );
          }
          throw new StoragePartialError(
            totalDeleted > 0
              ? "Account deletion could not be completed while removing your videos. Some of your videos may already have been removed. Please retry account deletion."
              : "Account deletion could not be completed while removing your videos. Please retry account deletion.",
          );
        }

        totalDeleted += result.deleted ?? 0;

        if (result.failed?.length || result.error) {
          console.error("deleteMyAccount: R2 reported failures", {
            failed: result.failed?.length ?? 0,
            error: result.error,
          });
          throw new StoragePartialError(
            totalDeleted > 0
              ? "Account deletion could not be completed because some of your videos could not be removed. Some of your videos may already have been removed. Please retry account deletion."
              : "Account deletion could not be completed because some of your videos could not be removed. Please retry account deletion.",
          );
        }

        if (result.complete) {
          cursor = undefined;
          break;
        }
        if (!result.cursor) {
          throw new StoragePartialError(
            "Account deletion could not be completed while removing your videos. Please retry account deletion.",
          );
        }
        cursor = result.cursor;
        if (round === MAX_R2_ROUNDS - 1) {
          throw new StoragePartialError(
            "Account deletion is taking longer than expected. Some of your videos may already have been removed — please retry account deletion.",
          );
        }
      }
    } catch (err) {
      if (err instanceof StorageUnavailableError || err instanceof StoragePartialError) {
        throw new Error(err.message);
      }
      throw err;
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
