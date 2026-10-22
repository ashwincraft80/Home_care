import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getBookingDetail } from "@/features/bookings/queries";
import { auditTrailFor, eligibleTechniciansFor } from "@/features/admin/service";
import { BookingDetailView } from "@/features/bookings/components/booking-detail-view";
import { Card, CardBody, CardHeader } from "@/components/ui/surface";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Booking (operations)" };

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const detail = await getBookingDetail(db, actor, id);
  if (!detail) notFound();
  const [eligible, audit] = await Promise.all([eligibleTechniciansFor(db, actor, id), auditTrailFor(db, actor, id)]);
  return (
    <div className="space-y-6">
      <BookingDetailView detail={detail} audience="admin" backHref="/admin/bookings" backLabel="Booking queue" eligible={eligible} />
      <Card>
        <CardHeader title="Audit trail" description="Append-only record of who changed what." />
        <CardBody>
          <ol className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 border-b border-line pb-2">
                <span className="text-ink-subtle tabular-nums">{fmt.dateTime(a.createdAt)}</span>
                <span className="font-semibold">{a.action}</span>
                <span className="text-ink-muted">
                  {a.actorName ?? "System"} ({a.actorRole?.toLowerCase()})
                </span>
                {Object.keys(a.metadata).length > 0 && <code className="text-xs text-ink-subtle">{JSON.stringify(a.metadata)}</code>}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
