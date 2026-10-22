import { Check, Phone, UserRound } from "lucide-react";
import type { BookingDetail } from "@/features/bookings/queries";
import { progressIndex, progressSteps } from "@/features/bookings/state-machine";
import {
  CompletionCelebration,
  ServiceInProgressAnimation,
  TechnicianAssignmentAnimation,
  TechnicianEnRouteAnimation,
} from "@/components/motion/loaders";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/surface";
import { statusLabelEn } from "@/components/domain/brand";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/cn";

const roleText: Record<string, string> = {
  REQUESTER: "Customer",
  CUSTOMER: "Customer",
  TENANT: "Tenant",
  LANDLORD: "Landlord",
  HOUSEHOLD_MEMBER: "Household member",
  PROPERTY_MANAGER: "Property manager",
  PROPERTY_OWNER: "Property owner",
  ADMIN: "Operations",
  TECHNICIAN: "Professional",
  ASSIGNED_TECHNICIAN: "Professional",
  SYSTEM: "System",
};
export const actorRoleText = (r: string | null) => (r ? (roleText[r] ?? r.replace(/_/g, " ").toLowerCase()) : "System");

/** The single booking timeline: progress steps + full status history. */
export function BookingTimeline({ detail }: { detail: BookingDetail }) {
  const current = progressIndex(detail.booking.status);
  const offTrack = ["CANCELLED", "DECLINED"].includes(detail.booking.status);
  return (
    <Card>
      <CardHeader title="Timeline" description="Every change to this booking, in order." />
      <CardBody>
        {!offTrack && (
          <ol className="mb-6 grid grid-cols-7 gap-1" aria-label="Progress">
            {progressSteps.map((s, i) => (
              <li key={s.status} className="min-w-0">
                <div className={cn("h-1.5 rounded-full", i <= current ? "bg-brand" : "bg-surface-sunken")} />
                <p className={cn("mt-1.5 hidden truncate text-[11px] font-semibold md:block", i === current ? "text-ink" : "text-ink-subtle")}>{s.label}</p>
              </li>
            ))}
          </ol>
        )}
        <ol className="relative space-y-5 border-l border-line pl-6">
          {[...detail.history].reverse().map((h, i) => (
            <li key={h.id} className="relative">
              <span className={cn("absolute -left-[31px] top-0.5 flex size-4 items-center justify-center rounded-full ring-4 ring-surface", i === 0 ? "bg-brand" : "bg-line-strong")}>
                {i === 0 && <Check className="size-2.5 text-white" aria-hidden />}
              </span>
              <p className="text-[15px] font-semibold text-ink">{statusLabelEn[h.toStatus]}</p>
              <p className="text-sm text-ink-muted">
                {fmt.dateTime(h.createdAt)} · {actorRoleText(h.actorRole)}
              </p>
              {h.note && <p className="mt-1 text-sm text-ink-muted">{h.note}</p>}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

/** A status-specific panel that reflects what is actually happening — never invented ETAs or people. */
export function StatusExperience({ detail, audience }: { detail: BookingDetail; audience: "requester" | "technician" | "admin" }) {
  const b = detail.booking;
  const windowLabel = fmt.window(b.slotStart, b.slotEnd);
  switch (b.status) {
    case "REQUESTED":
      return (
        <Alert tone="info" title="Request received">
          Operations will confirm your {detail.category.name.toLowerCase()} visit for {windowLabel}. You&apos;ll see the professional&apos;s details here once one is assigned.
        </Alert>
      );
    case "CONFIRMED":
      return audience === "technician" ? null : (
        <Card className="py-6">
          <TechnicianAssignmentAnimation label="Confirmed — finding an available professional…" />
          <p className="mt-2 px-6 text-center text-sm text-ink-muted">Your window: {windowLabel}</p>
        </Card>
      );
    case "EN_ROUTE":
      return <TechnicianEnRouteAnimation windowLabel={windowLabel} />;
    case "IN_PROGRESS":
      return (
        <div className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/60 px-4 py-3">
          <ServiceInProgressAnimation />
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Work in progress.</span> Any extra work or parts need an approved estimate first.
          </p>
        </div>
      );
    case "AWAITING_APPROVAL":
      return (
        <Alert tone="warning" title="Estimate waiting for approval">
          {audience === "technician" ? "Don't start extra work until the estimate is approved." : "Review the itemised estimate below. Nothing extra is done until it's approved."}
        </Alert>
      );
    case "COMPLETION_PENDING":
      return (
        <Alert tone="warning" title={audience === "requester" ? "Please confirm the work is complete" : "Waiting for the customer to confirm"}>
          {audience === "requester"
            ? "Check the work. Confirm to receive your invoice, or raise an issue if something isn't right."
            : `The customer can confirm or raise an issue. Operations can close it after the confirmation window${detail.viewer.adminCanCloseAfter ? ` (${fmt.dateTime(detail.viewer.adminCanCloseAfter)})` : ""}.`}
        </Alert>
      );
    case "COMPLETED":
      return (
        <CompletionCelebration
          title="Job complete"
          body={detail.invoice ? `Invoice ${detail.invoice.number} · ${formatMoney(detail.invoice.totalPaise)}` : "Confirmed complete."}
        />
      );
    case "DISPUTED":
      return (
        <Alert tone="danger" title="Issue under review">
          Operations is reviewing this job and will contact everyone involved. Payouts and invoices wait until it&apos;s resolved.
        </Alert>
      );
    case "RESCHEDULE_REQUESTED":
      return (
        <Alert tone="warning" title="Reschedule requested">
          Requested new window: {b.requestedSlotStart && b.requestedSlotEnd ? fmt.window(b.requestedSlotStart, b.requestedSlotEnd) : "—"}. Your original window stays until operations confirms.
        </Alert>
      );
    case "CANCELLED":
      return (
        <Alert tone="info" title="Booking cancelled">
          {b.cancellationReason}
          {b.cancellationFeePaise ? ` A late-cancellation fee of ${formatMoney(b.cancellationFeePaise)} was recorded.` : ""}
        </Alert>
      );
    case "DECLINED":
      return (
        <Alert tone="info" title="We couldn't take this booking">
          {b.cancellationReason}
        </Alert>
      );
    default:
      return null;
  }
}

/** Assigned professional or customer card — contact details only while the job is active. */
export function PeopleCard({ detail, audience }: { detail: BookingDetail; audience: "requester" | "technician" | "admin" }) {
  const person =
    audience === "technician"
      ? detail.customer && { title: "Customer", name: detail.customer.name ?? "Customer", phone: detail.customer.phone, extra: null as string | null }
      : detail.technician && {
          title: "Your professional",
          name: detail.technician.name,
          phone: detail.technician.phone,
          extra: [
            detail.technician.yearsExperience != null ? `${detail.technician.yearsExperience} yrs experience` : null,
            detail.technician.averageRating != null ? `${detail.technician.averageRating}★ from ${detail.technician.reviewCount} reviews` : detail.technician.reviewCount > 0 ? `${detail.technician.reviewCount} review(s) so far` : "New on HomeCare",
          ]
            .filter(Boolean)
            .join(" · "),
        };
  if (!person) return null;
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sage-soft text-brand-ink">
        <UserRound className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide text-ink-subtle uppercase">{person.title}</p>
        <p className="font-bold text-ink">{person.name}</p>
        {person.extra && <p className="text-sm text-ink-muted">{person.extra}</p>}
      </div>
      {person.phone ? (
        <a href={`tel:${person.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted">
          <Phone className="size-4" aria-hidden /> Call
        </a>
      ) : (
        <Badge tone="neutral">Contact shown during the visit</Badge>
      )}
    </Card>
  );
}

export function InvoiceCard({ detail }: { detail: BookingDetail }) {
  const inv = detail.invoice;
  if (!inv) return null;
  const payers = [...new Set(detail.estimates.filter((e) => e.approval?.decision === "APPROVED").map((e) => e.approval!.payer))];
  const payerText = payers.length === 0 ? "the person who booked" : payers.map((p) => ({ REQUESTER: "the person who booked", LANDLORD: "the landlord", PROPERTY: "the property", HOUSEHOLD: "the household" })[p as "REQUESTER"] ?? p).join(" / ");
  return (
    <Card>
      <CardHeader
        title={`Invoice ${inv.number}`}
        description={`Issued ${fmt.date(inv.issuedAt)}`}
        action={<Badge tone={inv.paymentStatus === "PAID" ? "success" : "warning"}>{inv.paymentStatus === "PAID" ? "Paid" : "Payment due"}</Badge>}
      />
      <CardBody>
        <dl className="space-y-2 text-[15px]">
          {[
            ["Visit / inspection fee", inv.visitFeePaise],
            ["Labour", inv.labourPaise],
            ["Parts", inv.partsPaise],
            ["Additional charges", inv.additionalPaise],
          ]
            .filter(([, v]) => (v as number) > 0)
            .map(([k, v]) => (
              <div key={k as string} className="flex justify-between">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="tabular-nums">{formatMoney(v as number)}</dd>
              </div>
            ))}
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(inv.totalPaise)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink-muted">Payable by {payerText}. Pay the professional by UPI or cash; online payment isn&apos;t available yet.</p>
        {inv.warrantyDays > 0 && (
          <div className="mt-4 rounded-lg bg-sage-soft px-3 py-2.5 text-sm text-brand-ink">
            <p className="font-semibold">
              Workmanship warranty: {inv.warrantyDays} days{inv.warrantyExpiresOn ? `, until ${fmt.date(inv.warrantyExpiresOn)}` : ""}
            </p>
            {inv.warrantyTerms && <p className="mt-0.5 text-[13px]">{inv.warrantyTerms}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
