import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Megaphone, Flag, BarChart3, Users, UserCog, UserX } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  const { role, permissions } = useAdminRole();
  const [stats, setStats] = useState({ users: 0, videos: 0, reports: 0, userReports: 0, announcements: 0 });

  useEffect(() => {
    (async () => {
      const [u, v, r, ur, a] = await Promise.all([
        // Count on "id" rather than "*": IP columns are not readable by
        // anon/authenticated, so a wildcard select is a permission error.
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("videos").select("id", { count: "exact", head: true }),
        permissions.has("view_reports")
          ? supabase.from("video_reports").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0 }),
        permissions.has("view_reports")
          ? supabase.from("user_reports").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0 }),
        supabase.from("announcements").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        users: u.count ?? 0,
        videos: v.count ?? 0,
        reports: (r as { count: number | null }).count ?? 0,
        userReports: (ur as { count: number | null }).count ?? 0,
        announcements: a.count ?? 0,
      });
    })();
  }, [permissions]);

  const cards = [
    { to: "/admin/announcements", label: "Announcements", icon: Megaphone, value: stats.announcements, show: permissions.has("post_announcements") },
    { to: "/admin/reports", label: "Video reports", icon: Flag, value: stats.reports, show: permissions.has("view_reports") },
    { to: "/admin/user-reports", label: "User reports", icon: UserX, value: stats.userReports, show: permissions.has("view_reports") },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3, value: "→", show: permissions.has("view_analytics") },
    { to: "/admin/users", label: "Users", icon: Users, value: stats.users, show: permissions.has("manage_users") },
    { to: "/admin/admins", label: "Admins", icon: UserCog, value: "→", show: role === "super_admin" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.filter((c) => c.show).map((c) => {
        const Icon = c.icon;
        return (
          <Link key={c.to} to={c.to} className="rounded-2xl border border-border p-4 hover:bg-muted transition-colors">
            <Icon className="h-5 w-5 text-primary mb-2" />
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </Link>
        );
      })}
    </div>
  );
}