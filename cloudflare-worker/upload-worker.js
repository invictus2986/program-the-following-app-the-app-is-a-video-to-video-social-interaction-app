/**
 * Cloudflare Worker for upload.jaiff.com
 *
 * Deploy this in your standalone Worker project (NOT this repo).
 *
 * Endpoints:
 *   POST   /upload?filename=<path>   Body: raw file bytes. Header: Authorization: Bearer <supabase access token>
 *   DELETE /upload?key=<path>        Header: Authorization: Bearer <supabase access token>
 *   OPTIONS *                        CORS preflight
 *
 * Matches src/routes/record.tsx which posts the raw Blob body with the file's
 * Content-Type and reads `{ fileUrl, key }` back from the JSON response.
 *
 * Required Worker bindings / vars:
 *   JAIFF_VIDEOS           R2 bucket binding
 *   PUBLIC_BASE_URL        e.g. https://cdn.jaiff.com  (public R2 / custom domain)
 *   SUPABASE_URL           https://<ref>.supabase.co
 *   SUPABASE_JWKS_URL      optional; defaults to `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
 */

const ALLOWED_ORIGINS = "*";
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB hard cap

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extra,
    },
  });
}

function textErr(msg, status) {
  return new Response(msg, { status, headers: corsHeaders });
}

/** Verify the Supabase-issued JWT and return its `sub` (user id). */
async function verifyBearer(request, env) {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Response("Missing bearer token", { status: 401, headers: corsHeaders });
  const token = m[1].trim();

  // Ask Supabase to validate the token. Cheap & simple; no JWKS plumbing needed.
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Response(`Supabase auth check failed: ${res.status} ${detail}`, { status: res.status, headers: corsHeaders });
  }
  const user = await res.json();
  if (!user?.id) throw new Response("Invalid token payload", { status: 401, headers: corsHeaders });
  return user.id;
}

/** Enforce that the object key lives under the caller's user-id folder. */
function assertOwnsKey(userId, key) {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw textErr("Invalid filename", 400);
  }
  const top = key.split("/")[0];
  if (top !== userId) {
    throw textErr("Forbidden", 403);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DELETE_PAGES = 20; // safe per-invocation page budget

/**
 * Server-to-server bulk delete of everything under `${uid}/`.
 * Requires the shared DELETE_SECRET; deliberately has NO CORS headers so it is
 * not usable from a browser. The prefix is computed from the UID only — no
 * caller-supplied prefix or key is ever honoured.
 */
async function handleDeleteAll(request, env) {
  const provided = request.headers.get("x-delete-secret") || "";
  const expected = env.DELETE_SECRET || "";
  if (!expected || provided !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ complete: false, deleted: 0, failed: [], error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  if (!UUID_RE.test(uid)) {
    return new Response(JSON.stringify({ complete: false, deleted: 0, failed: [], error: "Invalid uid" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Defence in depth #2: the forwarded Supabase access token must belong to the
  // very user whose prefix is being deleted. No CORS headers here — server-to-server only.
  let tokenUserId;
  try {
    tokenUserId = await verifyBearerNoCors(request, env);
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ complete: false, deleted: 0, failed: [], error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (tokenUserId !== uid) {
    return new Response(JSON.stringify({ complete: false, deleted: 0, failed: [], error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }



  const prefix = `${uid}/`;
  let cursor = typeof body?.cursor === "string" && body.cursor ? body.cursor : undefined;
  let deleted = 0;
  const failed = [];

  for (let page = 0; page < MAX_DELETE_PAGES; page++) {
    let listing;
    try {
      listing = await env.JAIFF_VIDEOS.list({ prefix, cursor, limit: 1000 });
    } catch (err) {
      console.error("list failed", err);
      return new Response(
        JSON.stringify({ complete: false, deleted, failed, cursor, error: "List failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Defence in depth: only keys that really live under the computed prefix.
    const keys = (listing.objects || []).map((o) => o.key).filter((k) => typeof k === "string" && k.startsWith(prefix));

    for (const key of keys) {
      try {
        await env.JAIFF_VIDEOS.delete(key);
        deleted++;
      } catch (err) {
        console.error("delete failed", err);
        failed.push(key);
      }
    }

    if (!listing.truncated) {
      return new Response(
        JSON.stringify({ complete: failed.length === 0, deleted, failed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    cursor = listing.cursor;
  }

  // Page budget reached: hand a continuation cursor back to the trusted caller.
  return new Response(JSON.stringify({ complete: false, deleted, failed, cursor }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Server-to-server only: checked before CORS/preflight handling.
    if (url.pathname === "/upload/all") {
      if (request.method !== "DELETE") return new Response("Method not allowed", { status: 405 });
      return handleDeleteAll(request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname !== "/upload") {
      return textErr("Not found", 404);
    }


    try {
      if (request.method === "POST") {
        const userId = await verifyBearer(request, env);

        const filename = url.searchParams.get("filename");
        if (!filename) return textErr("Missing filename", 400);
        assertOwnsKey(userId, filename);

        const lenHeader = request.headers.get("content-length");
        const contentLength = lenHeader ? Number(lenHeader) : NaN;
        if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
          return textErr("File too large", 413);
        }
        if (!request.body) return textErr("Empty body", 400);

        const contentType = request.headers.get("content-type") || "application/octet-stream";

        await env.JAIFF_VIDEOS.put(filename, request.body, {
          httpMetadata: { contentType },
        });

        const base = env.PUBLIC_BASE_URL.replace(/\/+$/, "");
        const fileUrl = `${base}/${filename.split("/").map(encodeURIComponent).join("/")}`;
        return json({ fileUrl, key: filename });
      }

      if (request.method === "DELETE") {
        const userId = await verifyBearer(request, env);
        const key = url.searchParams.get("key");
        if (!key) return textErr("Missing key", 400);
        assertOwnsKey(userId, key);
        await env.JAIFF_VIDEOS.delete(key);
        return json({ ok: true });
      }

      return textErr("Method not allowed", 405);
    } catch (err) {
      if (err instanceof Response) return err;
      console.error("upload worker error", err);
      return textErr("Internal error", 500);
    }
  },
};
