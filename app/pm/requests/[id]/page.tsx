import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getBookingDetail } from "@/features/bookings/queries";
import { BookingDetailView } from "@/features/bookings/components/booking-detail-view";

export const metadata: Metadata = { title: "Request" };

export default async function PmRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const actor = await requireActor("PROPERTY_MANAGER");
  const detail = await getBookingDetail(await getDb(), actor, id);
  if (!detail || detail.access !== "full" || !detail.booking.propertyId || !detail.viewer.membership) notFound();
  return <BookingDetailView detail={detail} audience="requester" backHref="/pm/requests" backLabel="All requests" justCreated={created === "1"} />;
}
