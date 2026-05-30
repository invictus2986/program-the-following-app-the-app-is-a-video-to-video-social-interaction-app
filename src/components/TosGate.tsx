import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { TermsOfServiceDialog } from "@/components/TermsOfServiceDialog";
import { PrivacyPolicyDialog } from "@/components/PrivacyPolicyDialog";
import { toast } from "sonner";

/**
 * Shows the Terms of Service dialog (then Privacy Policy) the first time
 * a user signs in, until they accept both. Acceptance is recorded in
 * the user's auth metadata so the dialogs do not appear on later logins.
 */
export function TosGate() {
  const { user } = useAuth();
  const [tosOpen, setTosOpen] = useState(false);
  const [ppOpen, setPpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const needsAcceptance =
    !!user &&
    (!user.user_metadata?.tos_accepted_at || !user.user_metadata?.pp_accepted_at);

  useEffect(() => {
    if (needsAcceptance) {
      setTosOpen(true);
    } else {
      setTosOpen(false);
      setPpOpen(false);
    }
  }, [needsAcceptance]);

  const handleTosAccept = () => {
    setTosOpen(false);
    setPpOpen(true);
  };

  const handlePpAccept = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.auth.updateUser({
        data: { tos_accepted_at: now, pp_accepted_at: now },
      });
      if (error) throw error;
      setPpOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <TermsOfServiceDialog
        open={tosOpen}
        onOpenChange={(o) => {
          // Don't let the user dismiss without accepting.
          if (!o && needsAcceptance) return;
          setTosOpen(o);
        }}
        onAccept={handleTosAccept}
        busy={busy}
        acceptLabel="Continue"
      />
      <PrivacyPolicyDialog
        open={ppOpen}
        onOpenChange={(o) => {
          if (!o && needsAcceptance) return;
          setPpOpen(o);
        }}
        onAccept={handlePpAccept}
        busy={busy}
        acceptLabel="I Accept"
      />
    </>
  );
}