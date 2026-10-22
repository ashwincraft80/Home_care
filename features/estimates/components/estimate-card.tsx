"use client";

import { useActionState, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { EstimateView } from "@/features/bookings/queries";
import { decideEstimateAction, withdrawEstimateAction } from "@/features/bookings/actions";
import { Badge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

const kindLabel = { LABOUR: "Labour", PART: "Part", ADDITIONAL: "Additional" } as const;
const statusTone = { SUBMITTED: "warning", APPROVED: "success", REJECTED: "danger", EXPIRED: "neutral", WITHDRAWN: "neutral" } as const;
const statusText = { SUBMITTED: "Awaiting approval", APPROVED: "Approved", REJECTED: "Declined", EXPIRED: "Expired", WITHDRAWN: "Withdrawn" } as const;
const payerText: Record<string, string> = { REQUESTER: "the person who booked", LANDLORD: "the landlord", PROPERTY: "the property", HOUSEHOLD: "the household" };

/** EstimateApprovalTransition: the card eases into view; decisions are bound to the exact total shown. */
export function EstimateCard({ estimate, canWithdraw }: { estimate: EstimateView; canWithdraw?: boolean }) {
  const reduced = useReducedMotion();
  const [declining, setDeclining] = useState(false);
  const [state, action] = useActionState(decideEstimateAction, null);
  const [wState, withdraw] = useActionState(withdrawEstimateAction, null);
  const e = estimate;
  const open = e.status === "SUBMITTED";
  const expired = e.isExpired;

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
      className={`rounded-[var(--radius-card)] border bg-surface ${open ? "border-[#f1dcb4] shadow-[var(--shadow-raised)]" : "border-line"}`}
      aria-label={`Estimate version ${e.version}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="font-bold text-ink">
            {e.kind === "SUPPLEMENTARY" ? "Additional work estimate" : "Estimate"} · v{e.version}
          </h3>
          <p className="text-sm text-ink-muted">
            Sent {fmt.dateTime(e.createdAt)}
            {open && ` · valid until ${fmt.dateTime(e.validUntil)}`}
          </p>
        </div>
        <Badge tone={statusTone[e.status]}>{statusText[e.status]}</Badge>
      </header>
      <div className="px-5 py-4">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">Diagnosis:</span> {e.diagnosis}
        </p>
        <table className="mt-4 w-full text-[15px]">
          <caption className="sr-only">Estimate line items</caption>
          <thead>
            <tr className="text-left text-xs tracking-wide text-ink-subtle uppercase">
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {e.visitFeePaise > 0 && (
              <tr>
                <td className="py-2">
                  Visit / inspection fee <span className="block text-xs text-ink-subtle">Agreed when you booked</span>
                </td>
                <td className="py-2 text-right">1</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(e.visitFeePaise)}</td>
              </tr>
            )}
            {e.items.map((i) => (
              <tr key={i.id}>
                <td className="py-2">
                  {i.description}
                  <span className="block text-xs text-ink-subtle">
                    {kindLabel[i.kind]} · {formatMoney(i.unitPricePaise)} each
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(i.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/10">
              <th scope="row" colSpan={2} className="pt-3 text-left font-bold">
                Estimated total
              </th>
              <td className="pt-3 text-right font-display text-xl font-semibold tabular-nums">{formatMoney(e.totalPaise)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-3 grid gap-1 text-sm text-ink-muted sm:grid-cols-3">
          <p>Labour {formatMoney(e.labourPaise)}</p>
          <p>Parts {formatMoney(e.partsPaise)}</p>
          <p>Additional {formatMoney(e.additionalPaise)}</p>
        </div>
        {e.exclusions && (
          <p className="mt-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">Not included:</span> {e.exclusions}
          </p>
        )}
        {e.notes && <p className="mt-1 text-sm text-ink-muted">{e.notes}</p>}

        {e.approval && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
            {e.approval.decision === "APPROVED" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
            <span>
              {e.approval.decision === "APPROVED" ? "Approved" : "Declined"} by {e.approval.decidedByName ?? "—"} on {fmt.dateTime(e.approval.createdAt)} for{" "}
              {formatMoney(e.approval.totalPaiseAtDecision)}
              {e.approval.decision === "APPROVED" && <> · payable by {payerText[e.approval.payer] ?? e.approval.payer}</>}
              {e.approval.reason && <> · “{e.approval.reason}”</>}
            </span>
          </p>
        )}
      </div>

      {open && (
        <footer className="border-t border-line px-5 py-4">
          {expired ? (
            <p className="text-sm text-ink-muted">This estimate has expired. The professional will send a fresh one.</p>
          ) : e.viewerCanApprove || e.viewerCanReject ? (
            <form action={action} className="space-y-3">
              <input type="hidden" name="estimateId" value={e.id} />
              <input type="hidden" name="expectedTotalPaise" value={e.totalPaise} />
              {e.viewerApprovalNote && <p className="text-sm font-semibold text-warning">{e.viewerApprovalNote}</p>}
              {declining && (
                <div>
                  <label htmlFor={`reason-${e.id}`} className="text-sm font-semibold text-ink">
                    Reason (optional)
                  </label>
                  <Textarea id={`reason-${e.id}`} name="reason" rows={2} className="mt-1 min-h-0" placeholder="e.g. I'll buy the part myself" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {e.viewerCanApprove && !declining && (
                  <SubmitButton name="decision" value="APPROVED" pendingLabel="Approving…">
                    Approve {formatMoney(e.totalPaise)}
                  </SubmitButton>
                )}
                {e.viewerCanReject &&
                  (declining ? (
                    <>
                      <SubmitButton name="decision" value="REJECTED" variant="danger" pendingLabel="Declining…">
                        Confirm decline
                      </SubmitButton>
                      <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
                        Back
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => setDeclining(true)}>
                      Decline
                    </Button>
                  ))}
              </div>
              <p className="text-xs text-ink-subtle">Approving records your name and the time. The approved total can&apos;t be changed later.</p>
              <div aria-live="polite">
                {state && !state.ok && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
                {state?.ok && <p className="text-sm font-semibold text-success">{state.data.decision === "EXPIRED" ? "This estimate had expired." : "Decision recorded."}</p>}
              </div>
            </form>
          ) : e.viewerApprovalNote ? (
            <p className="text-sm font-semibold text-warning">{e.viewerApprovalNote}</p>
          ) : canWithdraw ? (
            <form action={withdraw} className="flex items-center gap-3">
              <input type="hidden" name="estimateId" value={e.id} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Withdrawing…">
                Withdraw estimate
              </SubmitButton>
              {wState && !wState.ok && <p className="text-sm text-danger">{wState.error}</p>}
            </form>
          ) : (
            <p className="text-sm text-ink-muted">Waiting for the customer&apos;s decision.</p>
          )}
        </footer>
      )}
    </motion.article>
  );
}
