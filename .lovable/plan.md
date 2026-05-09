# Admin & Analytics System

## Roles
- **super_admin** — you. Full power. Can promote/demote others, grant/revoke any permission, cannot be demoted.
- **admin** — delegated. Has any subset of these permissions (you choose per-admin):
  - `post_announcements` — create/delete official announcements
  - `view_reports` — see all video reports filed by users
  - `view_analytics` — see the analytics dashboard
  - `manage_users` — ban/unban users, delete any video
  - `manage_admins` — promote/demote other admins (super-admin only by default)

## Database
New tables (all with strict RLS — only admins can read/write):
- `app_role` enum: `super_admin`, `admin`
- `user_roles` (user_id, role) — separate table per security best practice
- `admin_permissions` (user_id, permission) — granular flags per admin
- `announcements` (title, body, created_by, pinned, created_at)
- `user_bans` (user_id, banned_by, reason, created_at)
- `has_role(uuid, app_role)` and `has_permission(uuid, text)` security-definer functions

You'll be auto-seeded as super_admin on first login (via your existing user_id).

## UI

### For all users
- **Announcement banner** at top of home feed — dismissible, shows latest pinned announcement
- **/announcements** page — full list of past announcements

### For admins (link in profile dropdown, hidden for non-admins)
- **/admin** — dashboard hub
- **/admin/announcements** — create/edit/delete announcements *(if `post_announcements`)*
- **/admin/reports** — table of all video reports with reporter, video, reason, details, "view video" + "delete video" actions *(if `view_reports`)*
- **/admin/analytics** — metrics dashboard *(if `view_analytics`)*:
  - Total users, total videos, total replies, total likes
  - Active users (24h, 7d, 30d) — based on video_views
  - Avg videos per user, avg replies per user
  - Avg videos watched per session
  - Top 10 most-viewed/liked videos
  - New signups over time (chart)
  - Recharts line + bar charts
- **/admin/users** — list users with stats, ban/unban, delete videos *(if `manage_users`)*
- **/admin/admins** — promote users to admin, toggle their permissions, demote *(super_admin only)*

### Server functions
All admin actions go through `createServerFn` with `requireSupabaseAuth` + a role/permission check. Analytics queries run server-side with the user's auth (RLS enforced).

## Files to create
- migration (tables, RLS, helper functions, seed your super_admin)
- `src/lib/admin.functions.ts` — server fns for all admin ops
- `src/routes/_admin.tsx` — guard layout (checks role, redirects if not admin)
- `src/routes/_admin/admin.tsx` — dashboard hub
- `src/routes/_admin/admin.announcements.tsx`
- `src/routes/_admin/admin.reports.tsx`
- `src/routes/_admin/admin.analytics.tsx`
- `src/routes/_admin/admin.users.tsx`
- `src/routes/_admin/admin.admins.tsx`
- `src/routes/announcements.tsx` — public list
- `src/components/AnnouncementBanner.tsx` — top-of-feed banner
- `src/hooks/useAdminRole.ts` — current user's role + permissions
- edits to `src/routes/index.tsx` (banner), `src/components/AppShell.tsx` (admin link in menu)

## Notes
- Two open questions I'm defaulting on (tell me if you'd rather change):
  - **Announcements appear as**: dismissible banner on home + dedicated `/announcements` page
  - **Admin access**: link in profile menu (visible only to admins) + hidden `/admin` route
- Your account will be seeded as super_admin automatically — tell me your username so the migration can target you (or I can seed the first user who visits `/admin` if you prefer)
