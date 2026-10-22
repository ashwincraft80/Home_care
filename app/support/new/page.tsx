import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listCustomerBookings, listTechnicianJobs } from "@/features/bookings/queries";
import { NewComplaintForm } from "./form";
import { Card, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Raise an issue" };

export default async function NewComplaintPage({ searchParams }: { searchParams: Promise<{ booking?: string; category?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const db = await getDb();
  const isTech = actor.roles.includes("TECHNICIAN");
  const bookings = isTech ? await listTechnicianJobs(db, actor) : await listCustomerBookings(db, actor);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Raise an issue" description="Tell us what happened. A person from operations reviews every issue." />
      <Card className="p-6">
        <NewComplaintForm
          isTechnician={isTech}
          bookings={bookings.map((b) => ({ id: b.id, label: `${b.reference} · ${b.categoryName}` }))}
          defaultBooking={sp.booking}
          defaultCategory={sp.category}
        />
      </Card>
    </div>
  );
}
