import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listOpenOffers } from "@/features/bookings/queries";
import { guaranteedVisitPayout } from "@/features/estimates/calc";
import { ServiceTile } from "@/components/domain/brand";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Alert, PageHeader } from "@/components/ui/surface";
import { payoutPolicy } from "@/lib/config/site";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Available jobs" };

export default async function OffersPage() {
  const actor = await requireActor("TECHNICIAN");
  if (actor.technicianStatus !== "APPROVED") {
    return (
      <>
        <PageHeader title="Available jobs" />
        <Alert tone="info">Jobs are shown once operations approves your profile.</Alert>
      </>
    );
  }
  const offers = await listOpenOffers(await getDb(), actor);
  return (
    <>
      <PageHeader title="Available jobs" description="Confirmed jobs in your services and areas. The exact address is shared after you accept." />
      <Alert tone="info" className="mb-6">
        {payoutPolicy.summary} Declining a job never affects your ranking.
      </Alert>
      {offers.length === 0 ? (
        <IllustratedEmpty scene="search" title="No open jobs right now" body="New jobs in your areas appear here as soon as operations confirms them. Keep your availability up to date." action={{ href: "/tech/profile", label: "Update availability" }} />
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => (
            <li key={o.id}>
              <Link href={`/tech/jobs/${o.id}`} className="flex items-start gap-4 rounded-[var(--radius-card)] glass glass-sheen glass-hover p-4 sm:p-5">
                <ServiceTile icon={o.categoryIcon} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{o.categoryName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
                    <MapPin className="size-4" aria-hidden /> {o.locality} · {fmt.window(o.slotStart, o.slotEnd)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-ink">{o.problemDescription}</p>
                  <p className="mt-2 text-sm font-semibold text-brand-ink">Guaranteed for the visit: {formatMoney(guaranteedVisitPayout(o.visitFeePaise))} + 80% of approved labour</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
