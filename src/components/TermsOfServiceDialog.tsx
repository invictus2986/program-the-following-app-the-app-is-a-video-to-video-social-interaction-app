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

export function TermsOfServiceDialog({ open, onOpenChange, onAccept, busy, acceptLabel = "Create Account" }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Reset state whenever the dialog re-opens
  useEffect(() => {
    if (open) {
      setScrolledToEnd(false);
      setAgreed(false);
    }
  }, [open]);

  // If the content fits without scrolling, enable the checkbox immediately.
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
          <DialogDescription>
            Please read the Terms of Service. Scroll to the bottom, check &ldquo;I Agree&rdquo;, then press {acceptLabel}.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="h-[55vh] overflow-y-auto rounded-md border bg-muted/30 px-5 py-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap"
        >
{`TERMS OF SERVICE

1. Acceptance of Terms

Welcome to Jaiff ("Platform," "we," "our," or "us"), a service owned and operated by Unapse.

By creating an account, accessing the Platform, recording a video, posting content, or clicking "I Agree," you acknowledge that you have read, understood, and agree to be bound by these Terms of Service ("Terms").

If you do not agree to these Terms, you may not use the Platform.

2. Eligibility

You must be at least 13 years old to use the Platform.

If you are between the ages of 13 and 17, you may only use the Platform with the permission and supervision of your parent or legal guardian.

By using the Platform, you represent and warrant that:

You are at least 13 years old;
If you are under 18 years old, your parent or legal guardian has reviewed and agreed to these Terms and approved your use of the Platform;
You have the legal capacity to enter into these Terms or have obtained legally sufficient parental or guardian consent;
You are not prohibited from using the Platform under applicable law.

Parents and legal guardians who permit a minor to use the Platform agree to supervise the minor's use and accept responsibility for the minor's activities on the Platform.

3. Nature of the Platform

Jaiff is a public video conversation service that allows users to:

Record videos directly within the app;
Publish video posts;
Respond to other users exclusively through video responses;
Participate in public conversation threads.

The Platform does not permit users to upload pre-recorded videos, edited videos, imported videos, or meme content from external sources.

All videos posted to the Platform are public unless explicitly labeled otherwise by the Platform.

4. Public Content Warning

You understand and acknowledge that:

Videos posted to the Platform may be viewed by the public;
Other users may record, copy, repost, or redistribute your content;
We cannot guarantee complete removal of content once published online;
You post videos at your own risk.

Do not post information you consider private or confidential.

5. User Accounts

You are responsible for:

Maintaining the confidentiality of your account credentials;
All activities occurring under your account;
Providing accurate registration information.

You may not:

Share accounts;
Sell accounts;
Create accounts using false identities;
Impersonate another person or entity.

We reserve the right to suspend or terminate accounts at our sole discretion.

6. User Content Ownership

You retain ownership of the videos and content you create and post to the Platform ("User Content").

However, by posting User Content, you grant the Platform a worldwide, non-exclusive, royalty-free, transferable, sublicensable license to:

Host;
Store;
Reproduce;
Display;
Distribute;
Modify for technical formatting;
Promote;
Use your content in connection with operating, improving, marketing, and providing the Platform.

This license continues until your content is deleted from the Platform, except to the extent:

Content has been shared by others;
Archived for legal or compliance purposes;
Retained in backups;
Used in promotional materials already created.

7. Recording and Consent Requirements

You represent and warrant that:

You have the legal right to record and publish all persons appearing in your videos;
You have obtained all legally required permissions and consents;
Your content does not violate any privacy, publicity, or likeness rights.

You may not:

Secretly record individuals where prohibited by law;
Post non-consensual intimate content;
Use another person's image or voice deceptively;
Create misleading impersonations;
Misrepresent your identity.

8. Prohibited Conduct

You agree not to post, transmit, or engage in content or conduct that:

Is illegal;
Harasses, threatens, or intimidates others;
Promotes violence or criminal conduct;
Contains hate speech or targeted harassment;
Contains nudity or sexually explicit material;
Exploits or endangers minors;
Promotes self-harm or suicide;
Violates intellectual property rights;
Contains false or deceptive impersonation;
Includes malware, spam, scams, or phishing;
Encourages dangerous conduct;
Violates applicable laws or regulations.

We may remove content or restrict accounts at any time for any reason.

9. Moderation Rights

We reserve the right, but not the obligation, to:

Monitor content;
Remove or restrict content;
Suspend or terminate users;
Investigate violations;
Cooperate with law enforcement;
Preserve information when legally required.

Moderation decisions may be made manually or through automated systems.

10. Artificial Intelligence and Automated Systems

The Platform may use automated systems, machine learning, or artificial intelligence tools to:

Moderate content;
Detect spam or abuse;
Recommend content;
Improve platform functionality.

You acknowledge that automated systems may occasionally make errors.

11. Intellectual Property

The Platform, including its software, design, trademarks, logos, interfaces, and technology, is owned by the Company and protected by intellectual property laws.

You may not:

Copy the Platform;
Reverse engineer the Platform;
Scrape the Platform;
Use automated bots without permission;
Reproduce Company intellectual property without authorization.

12. Copyright Complaints

If you believe content on the Platform infringes your copyright rights, you may submit a notice including:

Your contact information;
Identification of the copyrighted work;
Identification of the allegedly infringing content;
A statement under penalty of perjury that your complaint is accurate.

The Company may remove allegedly infringing material and terminate repeat infringers.

13. Privacy

Your use of the Platform is also governed by the Privacy Policy.

By using the Platform, you acknowledge that video recordings may include:

Your image;
Voice;
Facial characteristics;
Behavioral information;
Metadata.

You consent to our collection, storage, and processing of this information as described in the Privacy Policy.

14. No Expectation of Privacy

You acknowledge and agree that:

Content posted on the Platform is public;
Communications may be viewed by others;
The Company cannot guarantee privacy or confidentiality.

15. Safety Disclaimer

The Platform may contain offensive, inaccurate, controversial, or disturbing content.

We do not endorse user-generated content.

Users interact with content and other users at their own risk.

16. Third-Party Conduct

We are not responsible for:

User conduct;
User-generated content;
Harassment by users;
Off-platform actions by users;
Disputes between users.

17. Disclaimer of Warranties

THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE."

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING:

MERCHANTABILITY;
FITNESS FOR A PARTICULAR PURPOSE;
NON-INFRINGEMENT;
ACCURACY;
RELIABILITY;
AVAILABILITY;
SECURITY.

WE DO NOT GUARANTEE THAT:

THE PLATFORM WILL BE UNINTERRUPTED;
CONTENT WILL ALWAYS BE AVAILABLE;
THE PLATFORM WILL BE ERROR-FREE OR SECURE.

18. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY SHALL NOT BE LIABLE FOR:

INDIRECT DAMAGES;
INCIDENTAL DAMAGES;
CONSEQUENTIAL DAMAGES;
LOSS OF PROFITS;
LOSS OF DATA;
REPUTATIONAL HARM;
USER CONTENT;
USER CONDUCT.

IN NO EVENT SHALL THE COMPANY'S TOTAL LIABILITY EXCEED THE GREATER OF:

$100 USD; OR
THE AMOUNT YOU PAID TO THE COMPANY IN THE PRECEDING 12 MONTHS.

19. Indemnification

You agree to defend, indemnify, and hold harmless the Company and its officers, employees, affiliates, and agents from claims, damages, liabilities, and expenses arising from:

Your content;
Your use of the Platform;
Your violation of these Terms;
Your violation of any law or third-party rights.

20. Termination

We may suspend or terminate your access to the Platform at any time, with or without notice, for any reason.

You may stop using the Platform at any time.

Sections intended to survive termination shall remain in effect.

21. Arbitration and Class Action Waiver

PLEASE READ THIS SECTION CAREFULLY.

To the fullest extent permitted by law:

Disputes shall be resolved through binding arbitration;
Users waive the right to jury trials;
Users waive participation in class actions or class arbitrations.

Arbitration shall occur in the State of Utah, unless otherwise required by law.

22. Governing Law

These Terms shall be governed by the laws of the State of Utah, without regard to conflict of law principles.

23. Changes to Terms

We may update these Terms at any time.

Continued use of the Platform after updated Terms become effective constitutes acceptance of the revised Terms.

24. Severability

If any provision of these Terms is found unenforceable, the remaining provisions shall remain in full force and effect.

25. Entire Agreement

These Terms constitute the entire agreement between you and the Company regarding use of the Platform.

26. Contact Information

Company Name: Unapse

Business Address: 7533 S Center View Ct Ste N West Jordan UT 84084

Email: Podgorskiy.serge@gmail.com
`}
        </div>

        {!scrolledToEnd && (
          <p className="text-xs text-muted-foreground -mt-2">Scroll to the bottom to enable the agreement checkbox.</p>
        )}

        <label className={`flex items-center gap-2 text-sm cursor-pointer ${scrolledToEnd ? "" : "opacity-50 pointer-events-none"}`}>
          <Checkbox
            id="tos-agree"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            disabled={!scrolledToEnd}
          />
          <span>I Agree to the Terms of Service</span>
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