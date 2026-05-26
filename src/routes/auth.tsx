import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TermsOfServiceDialog } from "@/components/TermsOfServiceDialog";
import { PrivacyPolicyDialog } from "@/components/PrivacyPolicyDialog";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tosOpen, setTosOpen] = useState(false);
  const [ppOpen, setPpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | "email" | "google" | "apple">(null);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  const validateSignupForm = () => {
        const cleanU = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (cleanU.length < 3) {
          toast.error("Username must be at least 3 characters (letters, numbers, _)");
      return null;
        }
        const cleanDisplay = displayName.trim();
        if (cleanDisplay.length < 1) {
          toast.error("Please enter a display name");
      return null;
        }
        if (cleanDisplay.length > 50) {
          toast.error("Display name must be 50 characters or less");
      return null;
    }
    return { cleanU, cleanDisplay };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") {
      const ok = validateSignupForm();
      if (!ok) return;
      setPendingAction("email");
      setTosOpen(true);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTosAccept = () => {
    setTosOpen(false);
    setPpOpen(true);
  };

  const handlePrivacyAccept = async () => {
    setBusy(true);
    try {
      if (pendingAction === "email") {
        const ok = validateSignupForm();
        if (!ok) {
          setBusy(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              username: ok.cleanU,
              display_name: ok.cleanDisplay,
              tos_accepted_at: new Date().toISOString(),
              pp_accepted_at: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        toast.success("Account created! Check your email to verify.");
        setPpOpen(false);
      } else if (pendingAction === "google" || pendingAction === "apple") {
        const result = await lovable.auth.signInWithOAuth(pendingAction, {
          redirect_uri: window.location.origin,
        });
        if (result.error) {
          toast.error(result.error.message ?? `${pendingAction} sign-in failed`);
        }
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  return (
    <AppShell>
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="rounded-3xl bg-card border border-border p-8 shadow-[var(--shadow-elev)]">
          <h1 className="text-3xl font-display font-bold mb-2">{mode === "signin" ? "Welcome back" : "Join WOPLA"}</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {mode === "signin" ? "Sign in to post and reply with video." : "Pick a handle. The world will see it."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full font-semibold mb-4"
            onClick={async () => {
              if (mode === "signup") {
                setPendingAction("google");
                setTosOpen(true);
                return;
              }
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              if (result.error) {
                toast.error(result.error.message ?? "Google sign-in failed");
              }
            }}
          >
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full font-semibold mb-4"
            onClick={async () => {
              if (mode === "signup") {
                setPendingAction("apple");
                setTosOpen(true);
                return;
              }
              const result = await lovable.auth.signInWithOAuth("apple", {
                redirect_uri: window.location.origin,
              });
              if (result.error) {
                toast.error(result.error.message ?? "Apple sign-in failed");
              }
            }}
          >
            Continue with Apple
          </Button>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="u">Username</Label>
                <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourhandle" required />
              </div>
            )}
            {mode === "signup" && (
              <div>
                <Label htmlFor="dn">Display name</Label>
                <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required maxLength={50} />
              </div>
            )}
            <div>
              <Label htmlFor="e">Email</Label>
              <Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="p">Password</Label>
              <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={busy} className="w-full rounded-full font-semibold">
              {busy ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 text-sm text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
      <TermsOfServiceDialog
        open={tosOpen}
        onOpenChange={(o) => {
          setTosOpen(o);
          if (!o) setPendingAction(null);
        }}
        onAccept={handleTosAccept}
        busy={busy}
        acceptLabel="Create Account"
      />
    </AppShell>
  );
}