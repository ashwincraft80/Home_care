"use client";

import {
  acceptOfferAction,
  declineOfferAction,
  progressAction,
  submitCompletionAction,
  uploadPhotosAction,
  withdrawAction,
} from "@/features/bookings/actions";
import { EstimateBuilder } from "@/features/estimates/components/estimate-builder";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import type { BookingStatus } from "@/types/domain";

export function OfferActions({ bookingId }: { bookingId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ActionForm action={acceptOfferAction as never}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <SubmitButton size="lg" className="w-full" pendingLabel="Accepting…">
          Accept job
        </SubmitButton>
      </ActionForm>
      <ActionForm action={declineOfferAction as never}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <label htmlFor="decline-reason" className="sr-only">
          Reason
        </label>
        <Select id="decline-reason" name="reason" defaultValue="Not available then">
          <option>Not available then</option>
          <option>Too far</option>
          <option>Outside my skills</option>
          <option>Other</option>
        </Select>
        <SubmitButton size="lg" variant="secondary" className="w-full" pendingLabel="Declining…">
          Decline (no penalty)
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

export function TechnicianJobActions({
  bookingId,
  status,
  allowed,
  visitFeePaise,
  hasApprovedInitial,
}: {
  bookingId: string;
  status: BookingStatus;
  allowed: BookingStatus[];
  visitFeePaise: number;
  hasApprovedInitial: boolean;
}) {
  const can = (s: BookingStatus) => allowed.includes(s);
  return (
    <div className="space-y-4">
      {can("EN_ROUTE") && (
        <ActionForm action={progressAction as never}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="to" value="EN_ROUTE" />
          <SubmitButton size="lg" className="w-full" pendingLabel="Updating…">
            I&apos;m on my way
          </SubmitButton>
        </ActionForm>
      )}
      {can("IN_PROGRESS") && status === "EN_ROUTE" && (
        <ActionForm action={progressAction as never}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="to" value="IN_PROGRESS" />
          <SubmitButton size="lg" className="w-full" pendingLabel="Updating…">
            I&apos;ve arrived — start work
          </SubmitButton>
        </ActionForm>
      )}

      {status === "IN_PROGRESS" && (
        <>
          <Card className="p-4 sm:p-5">
            <h3 className="font-bold text-ink">{hasApprovedInitial ? "Need to do more? Send an additional estimate" : "Send an estimate"}</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {hasApprovedInitial
                ? "The approved estimate can't be changed. Extra work needs its own approval."
                : "Itemise labour and parts. The visit fee is already agreed. If no extra work is needed, go straight to completion."}
            </p>
            <div className="mt-4">
              <EstimateBuilder bookingId={bookingId} visitFeePaise={visitFeePaise} supplementary={hasApprovedInitial} />
            </div>
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="font-bold text-ink">Finish the job</h3>
            <p className="mt-1 text-sm text-ink-muted">The customer confirms before the job is marked complete and your payout is created.</p>
            <ActionForm action={submitCompletionAction as never} className="mt-4">
              <input type="hidden" name="bookingId" value={bookingId} />
              <Field label="What did you do?" htmlFor="work-summary">
                <Textarea id="work-summary" name="workSummary" rows={3} required minLength={5} />
              </Field>
              <fieldset className="grid gap-2.5">
                <legend className="mb-1 text-sm font-semibold text-ink">Checklist</legend>
                <Checkbox name="testedAfterRepair" label="Tested after the repair" />
                <Checkbox name="customerShownWork" label="Showed the work to the customer" />
                <Checkbox name="oldPartsHandedOver" label="Handed over replaced parts (if any)" />
                <Checkbox name="workAreaCleaned" label="Cleaned the work area" />
              </fieldset>
              <SubmitButton size="lg" className="w-full" pendingLabel="Submitting…">
                Submit completion
              </SubmitButton>
            </ActionForm>
          </Card>
        </>
      )}

      {["ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL"].includes(status) && (
        <details className="rounded-xl border border-white/70 bg-white/60">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Before / after photos</summary>
          <div className="border-t border-line p-4">
            <ActionForm action={uploadPhotosAction as never}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <Field label="Photo type" htmlFor="photo-purpose">
                <Select id="photo-purpose" name="purpose" defaultValue="BEFORE_PHOTO">
                  <option value="BEFORE_PHOTO">Before</option>
                  <option value="AFTER_PHOTO">After</option>
                </Select>
              </Field>
              <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="block text-sm" aria-label="Photos" />
              <SubmitButton variant="secondary" pendingLabel="Uploading…">
                Upload
              </SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}

      {status === "ASSIGNED" && (
        <details className="rounded-xl border border-white/70 bg-white/60">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Can&apos;t attend? Hand the job back</summary>
          <div className="border-t border-line p-4">
            <ActionForm action={withdrawAction as never}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <Field label="Reason for operations" htmlFor="withdraw-reason" hint="Recorded so operations can reassign quickly. There's no automatic penalty.">
                <Textarea id="withdraw-reason" name="reason" rows={2} required minLength={5} />
              </Field>
              <SubmitButton variant="danger" pendingLabel="Handing back…">
                Hand back job
              </SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
