"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Copy, Share2 } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { fmt } from "@/lib/time";

type InviteAction = (prev: ActionResult<{ link: string; expiresAt: string }> | null, fd: FormData) => Promise<ActionResult<{ link: string; expiresAt: string }>>;

/** Creates a single-use invitation link and offers copy / WhatsApp share (no messaging API needed). */
export function InviteLinkForm({ action, children, submitLabel, shareText }: { action: InviteAction; children: ReactNode; submitLabel: string; shareText: string }) {
  const [state, formAction] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  if (state?.ok) {
    return (
      <div className="space-y-3" role="status">
        <p className="text-sm text-ink-muted">Share this private link. It works once and expires {fmt.date(state.data.expiresAt)}.</p>
        <code className="block break-all rounded-lg bg-surface-muted px-3 py-2 text-xs">{state.data.link}</code>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(state.data.link);
              setCopied(true);
            }}
          >
            <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy link"}
          </Button>
          <a className={buttonClass("secondary", "sm")} href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${state.data.link}`)}`} target="_blank" rel="noopener noreferrer">
            <Share2 className="size-4" aria-hidden /> WhatsApp
          </a>
        </div>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-3">
      {children}
      {state && !state.ok && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton variant="secondary" pendingLabel="Creating link…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
