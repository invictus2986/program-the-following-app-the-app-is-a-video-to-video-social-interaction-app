import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const runDelete = useServerFn(deleteMyAccount);
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === "DELETE" && !deleting;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await runDelete({ data: undefined });
      toast.success("Your account and all of your videos have been permanently deleted.");
      onOpenChange(false);
      try {
        await supabase.auth.signOut();
      } catch {
        /* session is gone either way */
      }
      if (typeof window !== "undefined") {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
      navigate({ to: "/" });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Account deletion could not be completed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        if (!next) {
          setConfirmText("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Delete account
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="font-semibold">This is permanent and cannot be undone.</p>
          <p className="text-muted-foreground">
            Deleting your account permanently removes your profile, every video and reply you posted, your
            likes, follows, notifications and search history. Your videos will be erased from storage and
            cannot be recovered by you or by us.
          </p>
          <div>
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder="DELETE"
              disabled={deleting}
            />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!canDelete}>
            {deleting ? "Deleting..." : "Delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
