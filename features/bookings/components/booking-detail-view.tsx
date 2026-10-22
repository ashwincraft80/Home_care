import Link from "next/link";
import { ArrowLeft, CalendarClock, MapPin } from "lucide-react";
import type { BookingDetail } from "@/features/bookings/queries";
import { BookingTimeline, InvoiceCard, PeopleCard, StatusExperience } from "./booking-parts";
import { RequesterActions } from "./requester-actions";
import { OfferActions, TechnicianJobActions } from "./technician-actions";
import { AdminBookingActions } from "./admin-actions";
import { EstimateCard } from "@/features/estimates/components/estimate-card";
import { ServiceTile, StatusBadge, statusLabelEn } from "@/components/domain/brand";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/surface";
import { CompletionCelebration } from "@/components/motion/loaders";
import { guaranteedVisitPayout } from "@/features/estimates/calc";
import { payoutPolicy } from "@/lib/config/site";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { fmt } from "@/lib/time";

type Audience = "requester" | "technician" | "admin";

export interface EligibleTech {
  profileId: string;
  name: string;
  servesArea: boolean;
  busyInWindow: boolean;
  activeJobs: number;
}

const purposeLabel: Record<string, string> = {
  BOOKING_PHOTO: "Customer photo",
  BEFORE_PHOTO: "Before",
  AFTER_PHOTO: "After",
  WARRANTY_DOCUMENT: "Warranty",
  INVOICE_DOCUMENT: "Invoice",
};

export function BookingDetailView({
  detail,
  audience,
  backHref,
  backLabel,
  justCreated,
  eligible = [],
}: {
  detail: BookingDetail;
  audience: Audience;
  backHref: string;
  backLabel: string;
  justCreated?: boolean;
  eligible?: EligibleTech[];
}) {
  const b = detail.booking;
  const v = detail.viewer;
  const isOffer = detail.access === "offer";
  const hasApprovedInitial = detail.estimates.some((e) => e.kind === "INITIAL" && e.status === "APPROVED");
  const openEstimate = detail.estimates.find((e) => e.status === "SUBMITTED");
  const requesterSide = audience === "requester";
  const landlordPending = b.costApproval === "LANDLORD" && detail.approvers.length === 0;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {backLabel}
      </Link>

      {justCreated && (
        <CompletionCelebration
          title={`Booking request received — ${b.reference}`}
          body="We'll confirm shortly. Track every update on this page; nothing extra is done without your approval."
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <ServiceTile icon={detail.category.icon} size="lg" />
          <div>
            <p className="text-sm font-semibold text-ink-muted">{b.reference}</p>
            <h1 className="font-display text-[28px] leading-tight font-semibold text-ink">{detail.category.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden /> {fmt.window(b.slotStart, b.slotEnd)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {detail.property ? `${detail.property.name}${detail.property.unitLabel ? ` · ${detail.property.unitLabel}` : ""}` : `${b.locality}, ${b.city}`}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={b.status} />
          {b.occupancy === "TENANT" && <Badge tone="info">Rented home</Badge>}
        </div>
      </header>

      {!isOffer && <StatusExperience detail={detail} audience={audience} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {isOffer && (
            <Card>
              <CardHeader title="Job offer" description="Accept to see the full address and customer contact." />
              <CardBody className="space-y-4">
                <DescriptionList
                  items={[
                    { label: "Area", value: `${b.locality}, ${b.city}` },
                    { label: "Window", value: fmt.window(b.slotStart, b.slotEnd) },
                    { label: "Guaranteed for the visit", value: formatMoney(guaranteedVisitPayout(b.visitFeePaise)) },
                    { label: "Earnings rules", value: payoutPolicy.summary },
                  ]}
                />
                <OfferActions bookingId={b.id} />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="The problem" />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{b.problemDescription}</p>
              {detail.asset && (
                <p className="text-sm text-ink-muted">
                  Appliance: <span className="font-semibold text-ink">{detail.asset.nickname}</span>
                  {[detail.asset.brand, detail.asset.model].filter(Boolean).length > 0 && ` (${[detail.asset.brand, detail.asset.model].filter(Boolean).join(" ")})`}
                </p>
              )}
              {detail.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-3">
                  {detail.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={`/api/files/${a.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
                        <img src={`/api/files/${a.id}`} alt={purposeLabel[a.purpose] ?? "Photo"} className="size-24 object-cover" loading="lazy" />
                        <span className="block bg-surface-muted px-2 py-1 text-center text-xs font-semibold text-ink-muted">{purposeLabel[a.purpose]}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {detail.estimates.length > 0 && (
            <section aria-labelledby="estimates-h" className="space-y-3">
              <h2 id="estimates-h" className="text-lg font-bold text-ink">
                Estimates
              </h2>
              {detail.estimates.map((e) => (
                <EstimateCard key={e.id} estimate={e} canWithdraw={v.isAssignedTechnician} />
              ))}
            </section>
          )}

          {detail.completion && (
            <Card>
              <CardHeader title="Completion notes" description={`Submitted ${fmt.dateTime(detail.completion.submittedAt)}`} />
              <CardBody>
                <p className="text-[15px] text-ink">{detail.completion.workSummary}</p>
                <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                  {Object.entries({
                    testedAfterRepair: "Tested after repair",
                    customerShownWork: "Work shown to customer",
                    oldPartsHandedOver: "Replaced parts handed over",
                    workAreaCleaned: "Work area cleaned",
                  }).map(([k, label]) => (
                    <li key={k} className={detail.completion!.checklist[k] ? "text-success" : "text-ink-subtle"}>
                      {detail.completion!.checklist[k] ? "✓" : "–"} {label}
                    </li>
                  ))}
                </ul>
                {detail.completion.confirmedAt && <p className="mt-3 text-sm text-ink-muted">Confirmed {fmt.dateTime(detail.completion.confirmedAt)}</p>}
              </CardBody>
            </Card>
          )}

          <InvoiceCard detail={detail} />
          {!isOffer && <BookingTimeline detail={detail} />}
        </div>

        <aside className="space-y-4" aria-label="Actions and details">
          {!isOffer && <PeopleCard detail={detail} audience={audience} />}

          {requesterSide && landlordPending && openEstimate && (
            <Alert tone="warning" title="Waiting for your landlord">
              Invite your landlord below so they can approve this estimate. Work above your own limit won&apos;t start without them.
            </Alert>
          )}

          {requesterSide && (
            <RequesterActions
              bookingId={b.id}
              status={b.status}
              allowed={v.allowedTransitions}
              cancellationFeePaise={v.cancellationFeePaise}
              categoryId={detail.category.id}
              categorySlug={detail.category.slug}
              pincode={detail.location?.pincode ?? null}
              canReview={v.isCustomer && b.status === "COMPLETED" && !detail.review && Boolean(b.technicianId)}
              isRequesterSelf={v.isCustomer}
              needsLandlordInvite={landlordPending && !["COMPLETED", "CANCELLED", "DECLINED"].includes(b.status)}
              pendingInviteExpires={detail.pendingApproverInvite ? String(detail.pendingApproverInvite.expiresAt) : null}
              bookAgainHref={`/book?category=${detail.category.slug}&repeat=1${b.assetId ? `&asset=${b.assetId}` : ""}${b.propertyId ? `&property=${b.propertyId}` : ""}`}
            />
          )}

          {audience === "technician" && !isOffer && v.isAssignedTechnician && (
            <TechnicianJobActions bookingId={b.id} status={b.status} allowed={v.allowedTransitions} visitFeePaise={b.visitFeePaise} hasApprovedInitial={hasApprovedInitial} />
          )}

          {audience === "admin" && (
            <AdminBookingActions
              bookingId={b.id}
              status={b.status}
              hasTechnician={Boolean(b.technicianId)}
              eligible={eligible}
              canCloseCompletion={v.adminCanCloseNow}
              closeAfterLabel={v.adminCanCloseAfter ? fmt.dateTime(v.adminCanCloseAfter) : null}
            />
          )}

          <Card>
            <CardHeader title="Booking details" />
            <CardBody className="py-2">
              <DescriptionList
                items={[
                  ...(detail.location ? [{ label: "Address", value: `${detail.location.line1}${detail.location.landmark ? `, ${detail.location.landmark}` : ""}, ${b.locality} ${detail.location.pincode}` }] : []),
                  { label: "Visit fee", value: formatMoney(b.visitFeePaise) },
                  ...(formatMoneyRange(b.indicativeMinPaise, b.indicativeMaxPaise) ? [{ label: "Indicative range", value: `${formatMoneyRange(b.indicativeMinPaise, b.indicativeMaxPaise)} (not a quote)` }] : []),
                  { label: "Payment", value: "Pay the professional after service" },
                  {
                    label: "Cost approval",
                    value:
                      b.costApproval === "LANDLORD"
                        ? `Landlord${b.requesterApprovalLimitPaise ? ` (tenant approves up to ${formatMoney(b.requesterApprovalLimitPaise)})` : ""}${detail.approvers.length ? ` · ${detail.approvers.map((a) => a.name).join(", ")} joined` : " · not joined yet"}`
                        : b.costApproval === "PROPERTY"
                          ? "Property owner / managers within their limits"
                          : "The person who booked",
                  },
                  { label: "Cancellation", value: b.cancellationTerms },
                  { label: "Warranty", value: detail.category.warrantyDays ? `${detail.category.warrantyDays} days on workmanship` : "None" },
                  { label: "Status", value: statusLabelEn[b.status] },
                ]}
              />
            </CardBody>
          </Card>

          {audience === "technician" && detail.payout && (
            <Card className="p-4">
              <p className="text-sm text-ink-muted">Your payout for this job</p>
              <p className="font-display text-2xl font-semibold">{formatMoney(detail.payout.amountPaise)}</p>
              <Badge tone={detail.payout.status === "PAID" ? "success" : "warning"}>{detail.payout.status.replace("_", " ").toLowerCase()}</Badge>
            </Card>
          )}

          {detail.complaints.length > 0 && (
            <Card>
              <CardHeader title="Issues raised" />
              <CardBody className="space-y-2">
                {detail.complaints.map((c) => (
                  <Link key={c.id} href={audience === "admin" ? `/admin/complaints/${c.id}` : `/support/${c.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-muted">
                    <span className="font-semibold">{c.reference}</span>
                    <Badge tone={["RESOLVED", "CLOSED"].includes(c.status) ? "success" : "warning"}>{c.status.replace("_", " ").toLowerCase()}</Badge>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
          {!isOffer && (
            <p className="text-sm text-ink-muted">
              Need help with this booking?{" "}
              <Link href={`/support/new?booking=${b.id}`} className="font-semibold text-brand hover:underline">
                Contact support
              </Link>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
