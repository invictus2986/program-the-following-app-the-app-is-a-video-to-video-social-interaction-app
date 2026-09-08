import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Trash2, Shield, Mail, FileText } from "lucide-react";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Jaiff — Account Deletion" },
      {
        name: "description",
        content:
          "Request permanent deletion of your Jaiff account and associated data. Jaiff is operated by Unapse LLC.",
      },
      { property: "og:title", content: "Jaiff — Account Deletion" },
      {
        property: "og:description",
        content:
          "Request permanent deletion of your Jaiff account and associated data. Jaiff is operated by Unapse LLC.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const handleDeleteClick = () => {
    if (profile?.username) {
      navigate({ to: "/u/$username", params: { username: profile.username } });
    } else {
      navigate({ to: "/auth" });
    }
  };

  return (
    <AppShell>
      <main className="px-5 py-10 sm:py-14">
        <div className="space-y-8">
          <header className="space-y-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Delete Your Jaiff Account
            </h1>
            <p className="text-sm text-muted-foreground">Jaiff is operated by Unapse LLC.</p>
          </header>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-elev)]">
            <p className="text-[15px] leading-relaxed text-card-foreground">
              You can permanently delete your Jaiff account and the data associated with it.
              Deletion removes your profile, videos, replies, and other account-related information
              from Jaiff.
            </p>

            <div className="mt-6">
              <Button
                size="lg"
                onClick={handleDeleteClick}
                className="w-full rounded-full bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="h-4 w-4" />
                Delete My Jaiff Account
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {profile?.username ? (
                <>
                  You are signed in. Click the button above to go to your profile settings and
                  choose the account deletion option. Account deletion permanently removes your
                  account and associated Jaiff data.
                </>
              ) : (
                <>
                  To delete your account, sign in to Jaiff using the button above, open your profile
                  settings, and choose the account deletion option. Account deletion permanently
                  removes your account and associated Jaiff data.
                </>
              )}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
              <Trash2 className="h-5 w-5 text-primary" />
              What will be deleted?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Account deletion removes your Jaiff account and associated user data, including your
              Jaiff videos, replies, likes, follows, search history, and profile information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
              <Shield className="h-5 w-5 text-primary" />
              Data that may be retained
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Certain records may be retained where necessary for security, fraud prevention,
              moderation, legal obligations, or regulatory compliance, consistent with Jaiff's{" "}
              <Link
                to="/privacy"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground">
              <Mail className="h-5 w-5 text-primary" />
              Can't access your account?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you cannot access your account, you may request account deletion by contacting us
              at{" "}
              <a
                href="mailto:podgorskiy.serge@gmail.com"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                podgorskiy.serge@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                For more details on how Jaiff handles your data, please review our{" "}
                <Link
                  to="/privacy"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
