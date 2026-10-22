import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { getActor } from "@/lib/auth/session";
import { previewInvite } from "@/features/invitations/service";
import { acceptInviteAction } from "@/features/invitations/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert, Card } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { ErrorStateIllustration } from "@/components/motion/illustrations";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, actor] = await Promise.all([getDb().then((db) => previewInvite(db, token)), getActor()]);
  return (
    <div className="container-page max-w-xl py-16">
      {!preview || !preview.valid ? (
        <div className="text-center">
          <ErrorStateIllustration className="mx-auto" />
          <h1 className="mt-4 font-display text-3xl font-semibold">This invitation can&apos;t be used</h1>
          <p className="mt-2 text-ink-muted">{preview?.reason ?? "The link is invalid. Ask the person who invited you for a new one."}</p>
        </div>
      ) : (
        <Card className="p-8">
          <p className="text-sm font-semibold text-brand">Invitation</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">{preview.inviterName} invited you</h1>
          <p className="mt-3 text-[17px] text-ink-muted">You&apos;re being asked to {preview.description}.</p>
          <Alert tone="info" className="mt-5">
            You&apos;ll only get access to what&apos;s described above. You can leave at any time.
          </Alert>
          {actor ? (
            <ActionForm action={acceptInviteAction as never} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <SubmitButton size="lg" className="w-full" pendingLabel="Accepting…">
                Accept as {actor.name}
              </SubmitButton>
            </ActionForm>
          ) : (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className={buttonClass("primary", "lg")}>
                Sign in to accept
              </Link>
              <Link href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`} className={buttonClass("secondary", "lg")}>
                Create an account
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
