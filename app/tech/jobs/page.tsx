import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listTechnicianJobs } from "@/features/bookings/queries";
import { BookingList } from "@/features/bookings/components/booking-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "My jobs" };

export default async function TechJobsPage() {
  const actor = await requireActor("TECHNICIAN");
  const jobs = await listTechnicianJobs(await getDb(), actor);
  const done = jobs.filter((j) => ["COMPLETED", "CANCELLED", "DECLINED"].includes(j.status));
  const open = jobs.filter((j) => !done.includes(j));
  return (
    <>
      <PageHeader title="My jobs" description="Accepted, active and completed jobs." />
      {jobs.length === 0 ? (
        <IllustratedEmpty scene="technicians" title="No jobs yet" body="Accepted jobs and their history appear here." action={{ href: "/tech/offers", label: "See available jobs" }} />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-bold">In progress ({open.length})</h2>
            {open.length ? <BookingList items={open} hrefBase="/tech/jobs" /> : <p className="text-sm text-ink-muted">Nothing active.</p>}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Completed & closed ({done.length})</h2>
            {done.length ? <BookingList items={done} hrefBase="/tech/jobs" /> : <p className="text-sm text-ink-muted">Completed jobs appear here.</p>}
          </section>
        </div>
      )}
    </>
  );
}
