import { Link, useNavigate } from "@tanstack/react-router";
import { Home, Search, Video, User as UserIcon, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useAdminRole } from "@/hooks/useAdminRole";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const { isAdmin } = useAdminRole();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full max-w-[440px] border-x border-border bg-background">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-[image:var(--gradient-mint)] shadow-[var(--shadow-glow)] grid place-items-center">
              <Video className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">WOPLA</span>
          </Link>
          <nav className="flex items-center gap-1">
            {user && profile ? (
              <Link to="/u/$username" params={{ username: profile.username }} className="px-3 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center gap-2" activeProps={{ className: "text-primary" }}>
                <Home className="h-4 w-4" /> <span className="hidden sm:inline">Home</span>
              </Link>
            ) : (
              <Link to="/" className="px-3 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center gap-2" activeOptions={{ exact: true }} activeProps={{ className: "text-primary" }}>
                <Home className="h-4 w-4" /> <span className="hidden sm:inline">Home</span>
              </Link>
            )}
            <Link to="/search" className="px-3 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center gap-2" activeProps={{ className: "text-primary" }}>
              <Search className="h-4 w-4" /> <span className="hidden sm:inline">Search</span>
            </Link>
            {user ? (
              <>
                {isAdmin && (
                  <Link to="/admin" className="px-3 py-2 rounded-lg hover:bg-muted text-sm font-medium flex items-center gap-2" activeProps={{ className: "text-primary" }} title="Admin">
                    <Shield className="h-4 w-4" />
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