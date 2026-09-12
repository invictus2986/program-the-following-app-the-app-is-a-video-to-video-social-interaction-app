# Permanent video deletion + preserved conversation pyramid

## What exists today (inspection results)

**How reply relationships are stored**
- Original videos live in table `videos`.
- Replies live in a separate table `replies` with `video_id` (the conversation root video) and `parent_reply_id` (the reply it directly answers, `NULL` = direct reply to the root).
- So "original vs reply" is decided purely by **which table the row lives in**, not by a flag.

**How the Videos / Replies archives are populated**
- On a profile (`src/routes/u.$username.tsx`), the "videos" tab queries `videos` by `user_id`; the "responses" tab queries `replies` by `user_id`. Classification therefore follows the table automatically — nothing extra to maintain.

**The existing promotion system**
- Two security-definer triggers already implement the pyramid rule:
  - `trg_reparent_reply_children` (AFTER DELETE on `replies`): direct children get `parent_reply_id = OLD.parent_reply_id`, `parent_deleted = true`. Descendants untouched. → Case 1 correct.
  - `trg_promote_replies_on_video_delete` (BEFORE DELETE on `videos`): each direct reply row is **moved** into `videos` keeping the same id / owner / file / created_at, its whole subtree is re-rooted to it, its direct children get `parent_reply_id = NULL`, and its reply row is removed. → Cases 2, 3, 4 already behave as specified, including the automatic move from Replies archive to Videos archive.
- Verdict: the hierarchy rule is already implemented and does not need redesign.

**How deletion currently causes archiving**
- Owner deleting their own video: hard `DELETE FROM videos` (permanent) — correct already.
- Admin / super user deleting someone else's video: `UPDATE videos SET deleted_at = now()` — a **soft delete (archive)**, surfaced in `/admin/archive` with Restore + "Delete permanently". This is the behaviour requirement 1 asks to remove.
- `videos.deleted_at` is also honoured by the RLS read policy, so archived rows stay visible to owner/admins.

**R2 keys and R2 deletion**
- New uploads store the **full public playback URL** in `videos.storage_path` / `replies.storage_path` (e.g. `https://videos.jaiff.com/<uid>/<file>`); legacy rows store a Supabase Storage path. `publicUrl()` in `src/lib/video.ts` branches on `https://`.
- The Worker (`cloudflare-worker/upload-worker.js`) exposes `DELETE /upload?key=<key>` (requires the caller's Supabase bearer token, and enforces the key sits under the caller's own `<uid>/` prefix) and `DELETE /upload/all` (account deletion, shared `DELETE_SECRET`).
- Current UI deletes **do not** call R2 at all — they call `supabase.storage.from("videos").remove(...)`, which is a no-op for R2 rows. Every deleted video today leaves an orphan object in `jaiff-videos`.

## Proposed changes

### 1. Permanent deletion for super users / admins
- `src/routes/v.$videoId.tsx`: replace the admin soft-delete branch with the same hard `DELETE FROM videos` used for owners, so the promotion trigger runs and no archived record remains.
- `src/routes/admin.users.tsx` (and any other admin surface that sets `deleted_at`): switch to hard delete.
- `/admin/archive` stays as a read-only cleanup tool for already-archived legacy rows (Restore removed is optional — I'll keep the page working, no redesign).
- Optional follow-up migration (only on your say-so): hard-delete existing `deleted_at` rows so the archive empties.

### 2. Delete the R2 object on every deletion
- New helper `src/lib/r2.ts`: derives the object key from `storage_path` (strip the public base URL; skip legacy Supabase paths) and calls the Worker.
- Owner deletions call `DELETE /upload?key=…` with the user's bearer token (already supported, ownership-checked).
- Admin deletions of **someone else's** file cannot use that endpoint (the prefix check rejects it). Add a privileged path: a new server function in `src/lib/moderation.functions.ts` that verifies `has_permission(manage_users)` server-side and then calls a new Worker route `DELETE /upload/object?key=…` authenticated with the existing server-only `R2_DELETE_SECRET` / Worker `DELETE_SECRET`.
- Deletion order: delete the DB row first (triggers run, children survive), then delete only the deleted row's own object. Children's files are never touched.

### 3. Reply deletion
- Same treatment: reply delete removes the row (children reparent via trigger) and deletes only that reply's own R2 object.

### 4. No change to the pyramid logic
- Triggers, foreign keys, `promoted_from_deleted_parent`, `parent_deleted`, counters, feeds, likes, notifications, upload flow and auth stay exactly as they are.

## Known caveat to confirm
When a reply is promoted into `videos`, the inserted row gets `caption = NULL`, `hashtags = {}`, and `views_count`/`likes_count` at 0 — because the `replies` table has no caption/hashtag/view/like columns to carry over. Id, owner, file, duration, created_at and the whole descendant subtree are preserved. Nothing is lost that was ever stored on a reply; I'd leave this as-is unless you want reply-level captions added.

## Deployment note
The Worker change (`/upload/object`) has to be deployed to Cloudflare by you; until then admin-side R2 cleanup will report a failure while the database-side deletion still succeeds correctly.
