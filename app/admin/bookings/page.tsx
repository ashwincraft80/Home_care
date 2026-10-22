import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listBookingsAdmin } from "@/features/bookings/queries";
import { listAllCategoriesForAdmin } from "@/features/catalog/service";
import { BookingList } from "@/features/bookings/components/booking-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { PageHeader } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { bookingStatuses } from "@/types/domain";
import { statusLabelEn } from "@/components/domain/brand";

export const metadata: Metadata = { title: "Booking queue" };

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; q?: string; unassigned?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const [bookings, categories] = await Promise.all([
    listBookingsAdmin(db, actor, { status: sp.status, categoryId: sp.category, q: sp.q, unassigned: sp.unassigned === "1" }),
    listAllCategoriesForAdmin(db, actor.userId),
  ]);
  return (
    <>
      <PageHeader title="Booking queue" description="Sorted by urgency: new requests, disputes and reschedules first." />
      <form className="mb-5 grid gap-2 rounded-[var(--radius-card)] glass glass-sheen p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]" role="search">
        <label className="sr-only" htmlFor="f-status">
          Status
        </label>
        <Select id="f-status" name="status" defaultValue={sp.status ?? "ALL"}>
          <option value="ALL">All statuses</option>
          {bookingStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabelEn[s]}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-cat">
          Service
        </label>
        <Select id="f-cat" name="category" defaultValue={sp.category ?? ""}>
          <option value="">All services</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-q">
          Search
        </label>
        <Input id="f-q" name="q" defaultValue={sp.q ?? ""} placeholder="Reference or area" />
        <label className="flex items-center gap-2 px-2 text-sm font-semibold text-ink-muted">
          <input type="checkbox" name="unassigned" value="1" defaultChecked={sp.unassigned === "1"} className="size-4 accent-brand" /> Unassigned
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {bookings.length ? (
        <BookingList items={bookings} hrefBase="/admin/bookings" showProperty />
      ) : (
        <IllustratedEmpty scene="search" title="No bookings match" body="Try clearing a filter." />
      )}
    </>
  );
}
