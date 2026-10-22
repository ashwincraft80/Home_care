import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getBookingDetail } from "@/features/bookings/queries";
import { BookingDetailView } from "@/features/bookings/components/booking-detail-view";

export const metadata: Metadata = { title: "Job" };

export default async function TechJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("TECHNICIAN");
  const detail = await getBookingDetail(await getDb(), actor, id);
  // Technicians only see jobs assigned to them or open offers they're eligible for (RLS-enforced).
  if (!detail || (detail.access === "full" && detail.booking.technicianId !== actor.userId)) notFound();
  return <BookingDetailView detail={detail} audience="technician" backHref={detail.access === "offer" ? "/tech/offers" : "/tech/jobs"} backLabel={detail.access === "offer" ? "Available jobs" : "My jobs"} />;
}
