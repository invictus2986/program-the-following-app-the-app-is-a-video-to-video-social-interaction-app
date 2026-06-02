import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, Search, Video, User as UserIcon, LogOut, Shield, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useUnreadCount } from "@/hooks/useNotifications";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const { isAdmin, permissions } = useAdminRole();
  const { count: unread } = useUnreadCount();
  const [reportCount, setReportCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin || !permissions.has("view_reports")) { setReportCount(0); return; }
    let cancelled = false;
    const refresh = async () => {
      const [{ count: vc }, { count: uc }] = await Promise.all([
        supabase.from("video_reports").select("*", { count: "exact", head: true }),
        supabase.from("user_reports").select("*", { count: "exact", head: true }),
      ]);
      if (!cancelled) setReportCount((vc ?? 0) + (uc ?? 0));
    };
    refresh();
    const channel = supabase
      .channel("admin-report-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "video_reports" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_reports" }, refresh)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [isAdmin, permissions]);

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full max-w-[440px] border-x border-border bg-background">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-[image:var(--gradient-mint)] shadow-[var(--shadow-glow)] grid place-items-center">
              <Video className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold tracking-widest" style={{ fontFamily: "'Bungee', system-ui, sans-serif" }}>JAIFF</span>
          </Link>
          <nav className="flex items-center gap-1">
            {user && profile ? (
              <Link to="/u/$username" params={{ username: profile.username }} className="px-2 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center" activeProps={{ className: "text-primary" }} title="Home">
                <Home className="h-4 w-4" />
              </Link>
            ) : (
              <Link to="/" className="px-2 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center" activeOptions={{ exact: true }} activeProps={{ className: "text-primary" }} title="Home">
                <Home className="h-4 w-4" />
              </Link>
            )}
            <Link to="/search" className="px-2 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center" activeProps={{ className: "text-primary" }} title="Search">
              <Search className="h-4 w-4" />
            </Link>
            {user ? (
              <>
                <Link
                  to="/notifications"
                  className="relative px-3 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center gap-2"
                  activeProps={{ className: "text-primary" }}
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white grid place-items-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                {isAdmin && (
                  <Link to="/admin" className="relative px-3 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center gap-2" activeProps={{ className: "text-primary" }} title="Admin">
                    <Shield className="h-4 w-4" />
                    {reportCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white grid place-items-center">
                        {reportCount > 99 ? "99+" : reportCount}
                      </span>
                    )}
                  </Link>
                )}
                <Button variant="default" size="sm" className="ml-2 rounded-full font-semibold" onClick={() => navigate({ to: "/record" })}>
                  <Video className="h-4 w-4 mr-1" /> Post
                </Button>
                <Button variant="ghost" size="icon" onClick={() => signOut()} title="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="default" size="sm" className="ml-2 rounded-full font-semibold" onClick={() => navigate({ to: "/auth" })}>
                Sign in
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}