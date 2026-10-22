import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getBookingDetail } from "@/features/bookings/queries";
import { BookingDetailView } from "@/features/bookings/components/booking-detail-view";

export const metadata: Metadata = { title: "Booking" };

export default async function BookingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const actor = await requireActor();
  const detail = await getBookingDetail(await getDb(), actor, id);
  if (!detail || detail.access !== "full") notFound();
  // Property requests belong to the property workspace.
  if (detail.booking.propertyId && detail.viewer.membership && detail.viewer.membership.memberRole !== "TENANT") redirect(`/pm/requests/${id}`);
  return <BookingDetailView detail={detail} audience="requester" backHref="/account/bookings" backLabel="All bookings" justCreated={created === "1"} />;
}
