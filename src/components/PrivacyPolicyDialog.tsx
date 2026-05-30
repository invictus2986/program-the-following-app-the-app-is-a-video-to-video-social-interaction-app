import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  busy?: boolean;
  acceptLabel?: string;
};

export function PrivacyPolicyDialog({ open, onOpenChange, onAccept, busy, acceptLabel = "Create Account" }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setScrolledToEnd(false);
      setAgreed(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = viewportRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight < 24) {
      setScrolledToEnd(true);
    }
  }, [open]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setScrolledToEnd(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Privacy Policy</DialogTitle>
          <DialogDescription>
            Please read the Privacy Policy. Scroll to the bottom, check &ldquo;I Agree&rdquo;, then press {acceptLabel}.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="h-[55vh] overflow-y-auto rounded-md border bg-muted/30 px-5 py-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap"
        >
{`Jaiff Privacy Policy

Last Updated: May 26, 2026

Podgorskiy.serge@gmail.com`}
        </div>

        {!scrolledToEnd && (
          <p className="text-xs text-muted-foreground -mt-2">Scroll to the bottom to enable the agreement checkbox.</p>
        )}

        <label className={`flex items-center gap-2 text-sm cursor-pointer ${scrolledToEnd ? "" : "opacity-50 pointer-events-none"}`}>
          <Checkbox
            id="pp-agree"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            disabled={!scrolledToEnd}
          />
          <span>I Agree to the Privacy Policy</span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={onAccept}
            disabled={!agreed || !scrolledToEnd || busy}
            className="rounded-full font-semibold"
          >
            {busy ? "..." : acceptLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}