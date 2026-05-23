import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Shield, Megaphone, Flag, BarChart3, Users, UserCog, ChevronLeft, HardDrive, UserX } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, role, permissions, loading } = useAdminRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!isAdmin) {
      navigate({ to: "/" });
    }
  }, [user, isAdmin, loading, authLoading, navigate]);

  if (authLoading || loading || !isAdmin) {
    return (
      <AppShell>
        <div className="px-4 pt-12 text-center text-sm text-muted-foreground">Checking access…</div>
      </AppShell>
    );
  }

  const links: Array<{ to: string; label: string; icon: React.ElementType; show: boolean }> = [
    { to: "/admin", label: "Overview", icon: Shield, show: true },
    { to: "/admin/announcements", label: "Announcements", icon: Megaphone, show: permissions.has("post_announcements") },
    { to: "/admin/reports", label: "Reports", icon: Flag, show: permissions.has("view_reports") },
    { to: "/admin/user-reports", label: "User reports", icon: UserX, show: permissions.has("view_reports") },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3, show: permissions.has("view_analytics") },
    { to: "/admin/storage", label: "Storage", icon: HardDrive, show: permissions.has("view_analytics") },
    { to: "/admin/users", label: "Users", icon: Users, show: permissions.has("manage_users") },
    { to: "/admin/admins", label: "Admins", icon: UserCog, show: role === "super_admin" },
  ];

  return (
    <AppShell>
      <section className="px-4 pt-6 pb-16">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ChevronLeft className="h-3 w-3" /> Back
          </Link>
        </div>
        <h1 className="font-display text-2xl font-semibold mb-1 flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Admin
        </h1>
        <p className="text-xs text-muted-foreground mb-4">
          Signed in as <span className="font-mono">{role}</span>
        </p>
        <nav className="flex flex-wrap gap-1.5 mb-6 -mx-1">
          {links.filter((l) => l.show).map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-border hover:bg-muted flex items-center gap-1.5"
                activeProps={{ className: "bg-primary text-primary-foreground border-primary" }}
                activeOptions={{ exact: true }}
              >
                <Icon className="h-3.5 w-3.5" /> {l.label}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </section>
    </AppShell>
  );
}