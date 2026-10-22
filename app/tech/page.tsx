import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listOpenOffers, listTechnicianJobs } from "@/features/bookings/queries";
import { listMyPayouts, myReviewSummary } from "@/features/technicians/service";
import { BookingList } from "@/features/bookings/components/booking-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Alert, Card, PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { localDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };
const ACTIVE = ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETION_PENDING", "RESCHEDULE_REQUESTED", "DISPUTED"];

export default async function TechHome() {
  const actor = await requireActor("TECHNICIAN");
  const db = await getDb();
  const approved = actor.technicianStatus === "APPROVED";
  const [jobs, offers, payouts, reviews] = await Promise.all([
    listTechnicianJobs(db, actor),
    approved ? listOpenOffers(db, actor) : Promise.resolve([]),
    listMyPayouts(db, actor),
    myReviewSummary(db, actor),
  ]);
  const active = jobs.filter((j) => ACTIVE.includes(j.status)).sort((a, b) => +new Date(a.slotStart) - +new Date(b.slotStart));
  const today = localDateKey(new Date());
  const todays = active.filter((j) => localDateKey(new Date(j.slotStart)) === today);
  const pending = payouts.filter((p) => p.status !== "PAID").reduce((a, p) => a + p.amountPaise, 0);

  return (
    <>
      <PageHeader eyebrow={actor.name} title="Today's work" />
      {!approved && (
        <Alert tone={actor.technicianStatus === "SUSPENDED" || actor.technicianStatus === "REJECTED" ? "danger" : "info"} title={actor.technicianStatus === "PENDING_REVIEW" ? "Your profile is under review" : `Profile ${actor.technicianStatus?.toLowerCase().replace("_", " ")}`} className="mb-6">
          {actor.technicianStatus === "PENDING_REVIEW"
            ? "Complete your services, areas and availability. Operations reviews your profile before you can see or accept jobs."
            : "You can't take new jobs right now. Check your profile notes or contact support."}{" "}
          <Link href="/tech/profile" className="font-semibold underline">
            Open profile
          </Link>
        </Alert>
      )}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Jobs today", String(todays.length)],
          ["Open offers for you", approved ? String(offers.length) : "—"],
          ["Payouts pending", formatMoney(pending)],
        ].map(([k, v]) => (
          <Card key={k} className="p-5">
            <p className="text-sm text-ink-muted">{k}</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <section className="space-y-3" aria-labelledby="act">
        <h2 id="act" className="text-lg font-bold">
          Active jobs
        </h2>
        {active.length ? (
          <BookingList items={active} hrefBase="/tech/jobs" />
        ) : (
          <IllustratedEmpty
            scene="technicians"
            title="No active jobs"
            body={approved ? "Check available jobs in your areas. You see the area, window and earnings before accepting." : "Jobs appear once your profile is approved."}
            action={approved ? { href: "/tech/offers", label: "See available jobs" } : { href: "/tech/profile", label: "Complete profile" }}
          />
        )}
      </section>
      <p className="mt-8 text-sm text-ink-muted">
        {reviews.reviewCount < 5 ? `Ratings are shown publicly only after 5 reviews (you have ${reviews.reviewCount}).` : `Average rating ${reviews.averageRating} from ${reviews.reviewCount} reviews.`}{" "}
        <Link href="/tech/earnings" className="font-semibold text-brand hover:underline">
          How earnings work
        </Link>
      </p>
      {approved && offers.length > 0 && (
        <Link href="/tech/offers" className={buttonClass("primary", "lg", "fixed inset-x-4 bottom-4 z-30 sm:hidden")}>
          {offers.length} job{offers.length === 1 ? "" : "s"} available
        </Link>
      )}
    </>
  );
}
