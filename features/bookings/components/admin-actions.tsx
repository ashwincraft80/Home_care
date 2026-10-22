"use client";

import { adminBookingAction } from "@/features/bookings/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import type { BookingStatus } from "@/types/domain";

interface EligibleTech {
  profileId: string;
  name: string;
  servesArea: boolean;
  busyInWindow: boolean;
  activeJobs: number;
}

function Op({ bookingId, op, children }: { bookingId: string; op: string; children: React.ReactNode }) {
  return (
    <ActionForm action={adminBookingAction as never}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="op" value={op} />
      {children}
    </ActionForm>
  );
}

export function AdminBookingActions({
  bookingId,
  status,
  hasTechnician,
  eligible,
  canCloseCompletion,
  closeAfterLabel,
}: {
  bookingId: string;
  status: BookingStatus;
  hasTechnician: boolean;
  eligible: EligibleTech[];
  canCloseCompletion: boolean;
  closeAfterLabel: string | null;
}) {
  const assignable = ["REQUESTED", "CONFIRMED", "ASSIGNED"].includes(status);
  return (
    <div className="space-y-4">
      {status === "REQUESTED" && (
        <Card className="space-y-4 p-4">
          <h3 className="font-bold text-ink">New request</h3>
          <Op bookingId={bookingId} op="confirm">
            <Input name="note" placeholder="Note (optional)" aria-label="Note" />
            <SubmitButton pendingLabel="Confirming…">Confirm booking</SubmitButton>
          </Op>
          <Op bookingId={bookingId} op="decline">
            <Field label="Decline with a reason the customer will see" htmlFor="decline-reason">
              <Textarea id="decline-reason" name="reason" rows={2} required minLength={5} />
            </Field>
            <SubmitButton variant="danger" pendingLabel="Declining…">
              Decline request
            </SubmitButton>
          </Op>
        </Card>
      )}

      {assignable && (
        <Card className="space-y-3 p-4">
          <h3 className="font-bold text-ink">{hasTechnician ? "Reassign" : "Assign a professional"}</h3>
          {eligible.length === 0 ? (
            <p className="text-sm text-ink-muted">No approved professional offers this service. Review applications in Technicians.</p>
          ) : (
            <Op bookingId={bookingId} op="assign">
              <Field label="Professional" htmlFor="tech">
                <Select id="tech" name="technicianId" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {eligible.map((t) => (
                    <option key={t.profileId} value={t.profileId} disabled={t.busyInWindow}>
                      {t.name} · {t.activeJobs} active{!t.servesArea ? " · outside area" : ""}
                      {t.busyInWindow ? " · busy in this window" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Input name="note" placeholder="Note for the record (optional)" aria-label="Assignment note" />
              <SubmitButton pendingLabel="Assigning…">{hasTechnician ? "Reassign" : "Assign"}</SubmitButton>
            </Op>
          )}
          {hasTechnician && ["ASSIGNED", "EN_ROUTE"].includes(status) && (
            <Op bookingId={bookingId} op="unassign">
              <Input name="reason" placeholder="Reason for unassigning" aria-label="Reason" required />
              <SubmitButton variant="secondary" pendingLabel="Unassigning…">
                Unassign
              </SubmitButton>
            </Op>
          )}
        </Card>
      )}

      {status === "RESCHEDULE_REQUESTED" && (
        <Card className="flex flex-wrap gap-3 p-4">
          <Op bookingId={bookingId} op="approve_reschedule">
            <SubmitButton pendingLabel="Saving…">Approve new window</SubmitButton>
          </Op>
          <Op bookingId={bookingId} op="reject_reschedule">
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Keep original window
            </SubmitButton>
          </Op>
        </Card>
      )}

      {status === "COMPLETION_PENDING" && (
        <Card className="space-y-3 p-4">
          <h3 className="font-bold text-ink">Customer confirmation pending</h3>
          {canCloseCompletion ? (
            <Op bookingId={bookingId} op="close_completion">
              <SubmitButton pendingLabel="Closing…">Close as complete (window passed)</SubmitButton>
            </Op>
          ) : (
            <p className="text-sm text-ink-muted">You can close this on the customer&apos;s behalf after {closeAfterLabel}.</p>
          )}
          <Op bookingId={bookingId} op="resolve_rework">
            <Input name="note" placeholder="Why it needs rework" aria-label="Rework note" required />
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Send back for rework
            </SubmitButton>
          </Op>
        </Card>
      )}

      {status === "DISPUTED" && (
        <Card className="space-y-3 p-4">
          <h3 className="font-bold text-ink">Resolve the dispute</h3>
          {(
            [
              ["resolve_completed", "Close as complete (issue invoice)", "primary"],
              ["resolve_rework", "Send back for rework", "secondary"],
              ["resolve_cancel", "Cancel the job", "danger"],
            ] as const
          ).map(([op, label, variant]) => (
            <Op key={op} bookingId={bookingId} op={op}>
              <Input name="note" placeholder="Resolution note (shared with both sides)" aria-label="Resolution note" required minLength={5} />
              <SubmitButton variant={variant} pendingLabel="Saving…">
                {label}
              </SubmitButton>
            </Op>
          ))}
        </Card>
      )}

      {["REQUESTED", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "RESCHEDULE_REQUESTED"].includes(status) && (
        <details className="rounded-xl border border-white/70 bg-white/60">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-danger">Cancel on behalf of operations</summary>
          <div className="border-t border-line p-4">
            <Op bookingId={bookingId} op="cancel">
              <Input name="reason" placeholder="Reason (shared with the customer)" aria-label="Cancellation reason" required />
              <SubmitButton variant="danger" pendingLabel="Cancelling…">
                Cancel booking (no fee)
              </SubmitButton>
            </Op>
          </div>
        </details>
      )}
    </div>
  );
}
