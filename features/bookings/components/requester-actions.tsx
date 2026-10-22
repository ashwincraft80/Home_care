"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Repeat, Share2 } from "lucide-react";
import {
  cancelBookingAction,
  confirmCompletionAction,
  disputeAction,
  getSlotsAction,
  inviteLandlordAction,
  rescheduleAction,
  reviewAction,
  uploadPhotosAction,
} from "@/features/bookings/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/surface";
import { InlineButtonLoader } from "@/components/motion/loaders";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";
import type { BookingStatus } from "@/types/domain";

interface Props {
  bookingId: string;
  status: BookingStatus;
  allowed: BookingStatus[];
  cancellationFeePaise: number;
  categoryId: string;
  categorySlug: string;
  pincode: string | null;
  canReview: boolean;
  isRequesterSelf: boolean;
  needsLandlordInvite: boolean;
  pendingInviteExpires: string | null;
  bookAgainHref: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/70 bg-white/60">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[15px] font-semibold text-ink">
        {title}
        <span aria-hidden className="text-ink-subtle transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

function RescheduleForm({ bookingId, categoryId, pincode }: { bookingId: string; categoryId: string; pincode: string }) {
  const [slots, setSlots] = useState<{ date: string; windowKey: string; start: string; end: string; remaining: number }[] | null>(null);
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState("");
  const load = () =>
    start(async () => {
      const res = await getSlotsAction(categoryId, pincode);
      if (res.ok) setSlots(((res.data.slots ?? []) as typeof slots)!.filter((s) => s.remaining > 0));
    });
  if (!slots)
    return (
      <Button type="button" variant="secondary" onClick={load} disabled={pending}>
        {pending && <InlineButtonLoader />} See available windows
      </Button>
    );
  const [date, windowKey] = choice.split("|");
  return (
    <ActionForm action={rescheduleAction as never}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="date" value={date ?? ""} />
      <input type="hidden" name="windowKey" value={windowKey ?? ""} />
      {slots.length === 0 ? (
        <p className="text-sm text-ink-muted">No other windows are free this week.</p>
      ) : (
        <Field label="New window" htmlFor="new-window">
          <Select id="new-window" value={choice} onChange={(e) => setChoice(e.target.value)} required>
            <option value="">Choose…</option>
            {slots.map((s) => (
              <option key={`${s.date}|${s.windowKey}`} value={`${s.date}|${s.windowKey}`}>
                {fmt.window(s.start, s.end)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <SubmitButton variant="secondary" disabled={!choice} pendingLabel="Requesting…">
        Request this window
      </SubmitButton>
    </ActionForm>
  );
}

function InviteLandlord({ bookingId, pendingInviteExpires }: { bookingId: string; pendingInviteExpires: string | null }) {
  const [state, action] = useActionState(inviteLandlordAction, null);
  const [copied, setCopied] = useState(false);
  if (state?.ok) {
    const text = `Please approve the repair cost for my HomeCare booking: ${state.data.link}`;
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Send this private link to your landlord. It works once and expires {fmt.date(state.data.expiresAt)}. They&apos;ll only see this booking.</p>
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
          <a className={buttonClass("secondary", "sm")} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            <Share2 className="size-4" aria-hidden /> Share via WhatsApp
          </a>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-sm text-ink-muted">
        Estimates above your limit wait for your landlord. Create a secure link to send them{pendingInviteExpires ? " (this replaces the link you created earlier)" : ""}.
      </p>
      <SubmitButton variant="secondary" pendingLabel="Creating link…">
        Create landlord link
      </SubmitButton>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function RequesterActions(p: Props) {
  const can = (s: BookingStatus) => p.allowed.includes(s);
  return (
    <div className="space-y-3">
      {can("COMPLETED") && p.status === "COMPLETION_PENDING" && (
        <Card className="p-4">
          <p className="font-semibold text-ink">Is the work done properly?</p>
          <p className="mt-1 text-sm text-ink-muted">Confirming issues your invoice and starts the workmanship warranty.</p>
          <ActionForm action={confirmCompletionAction as never} className="mt-3">
            <input type="hidden" name="bookingId" value={p.bookingId} />
            <SubmitButton pendingLabel="Confirming…">Yes, confirm completion</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {p.needsLandlordInvite && p.isRequesterSelf && (
        <Section title="Invite your landlord to approve costs">
          <InviteLandlord bookingId={p.bookingId} pendingInviteExpires={p.pendingInviteExpires} />
        </Section>
      )}

      {can("DISPUTED") && (
        <Section title="Something's not right? Raise an issue">
          <ActionForm action={disputeAction as never}>
            <input type="hidden" name="bookingId" value={p.bookingId} />
            <Field label="What kind of issue?" htmlFor="dispute-cat">
              <Select id="dispute-cat" name="category" defaultValue="QUALITY">
                <option value="QUALITY">Work quality</option>
                <option value="PRICING">Pricing</option>
                <option value="BEHAVIOUR">Professional&apos;s behaviour</option>
                <option value="DAMAGE">Damage to property</option>
                <option value="SAFETY">Safety concern</option>
                <option value="OTHER">Something else</option>
              </Select>
            </Field>
            <Field label="Tell us what happened" htmlFor="dispute-desc">
              <Textarea id="dispute-desc" name="description" required minLength={10} rows={3} />
            </Field>
            <SubmitButton variant="danger" pendingLabel="Sending…">
              Raise issue
            </SubmitButton>
            <p className="text-xs text-ink-subtle">The booking pauses while operations reviews it. You&apos;ll get updates in the support centre.</p>
          </ActionForm>
        </Section>
      )}

      {can("RESCHEDULE_REQUESTED") && p.pincode && (
        <Section title="Reschedule">
          <RescheduleForm bookingId={p.bookingId} categoryId={p.categoryId} pincode={p.pincode} />
        </Section>
      )}

      {can("CANCELLED") && (
        <Section title="Cancel booking">
          <ActionForm action={cancelBookingAction as never}>
            <input type="hidden" name="bookingId" value={p.bookingId} />
            {p.cancellationFeePaise > 0 ? (
              <Alert tone="warning">A late-cancellation fee of {formatMoney(p.cancellationFeePaise)} applies now.</Alert>
            ) : (
              <p className="text-sm text-ink-muted">Cancelling now is free.</p>
            )}
            <Field label="Reason (helps us improve)" htmlFor="cancel-reason">
              <Select id="cancel-reason" name="reason" defaultValue="Plans changed">
                <option>Plans changed</option>
                <option>Fixed it myself</option>
                <option>Booked by mistake</option>
                <option>Found another provider</option>
                <option>Price concerns</option>
              </Select>
            </Field>
            <SubmitButton variant="danger" pendingLabel="Cancelling…">
              Cancel booking{p.cancellationFeePaise > 0 ? ` (${formatMoney(p.cancellationFeePaise)} fee)` : ""}
            </SubmitButton>
          </ActionForm>
        </Section>
      )}

      {!["COMPLETED", "CANCELLED", "DECLINED"].includes(p.status) && (
        <Section title="Add photos">
          <ActionForm action={uploadPhotosAction as never}>
            <input type="hidden" name="bookingId" value={p.bookingId} />
            <input type="hidden" name="purpose" value="BOOKING_PHOTO" />
            <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="block text-sm" aria-label="Photos" />
            <p className="text-xs text-ink-subtle">JPG, PNG or WebP, up to 5 MB each.</p>
            <SubmitButton variant="secondary" size="sm" pendingLabel="Uploading…">
              Upload
            </SubmitButton>
          </ActionForm>
        </Section>
      )}

      {p.canReview && (
        <Section title="Rate this job">
          <ActionForm action={reviewAction as never}>
            <input type="hidden" name="bookingId" value={p.bookingId} />
            <fieldset>
              <legend className="text-sm font-semibold text-ink">Rating</legend>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex size-11 cursor-pointer items-center justify-center rounded-lg border border-line font-bold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="radio" name="rating" value={n} className="sr-only" required />
                    {n}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Comment (optional)" htmlFor="review-comment">
              <Textarea id="review-comment" name="comment" rows={2} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Submit review
            </SubmitButton>
          </ActionForm>
        </Section>
      )}

      {["COMPLETED", "CANCELLED", "DECLINED"].includes(p.status) && (
        <Link href={p.bookAgainHref} className={buttonClass("secondary", "md", "w-full")}>
          <Repeat className="size-4" aria-hidden /> Book again
        </Link>
      )}
    </div>
  );
}
