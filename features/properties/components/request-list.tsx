import type { PropertyRequestRow } from "@/features/properties/service";
import { BookingList } from "@/features/bookings/components/booking-list";
import type { BookingStatus } from "@/types/domain";

export function PropertyRequestList({ items, hrefBase = "/pm/requests" }: { items: PropertyRequestRow[]; hrefBase?: string }) {
  return (
    <BookingList
      hrefBase={hrefBase}
      showProperty
      items={items.map((r) => ({
        id: r.id,
        reference: r.reference,
        status: r.status as BookingStatus,
        categoryName: r.categoryName,
        categorySlug: "",
        categoryIcon: r.categoryIcon,
        slotStart: r.slotStart,
        slotEnd: r.slotEnd,
        locality: "",
        propertyId: r.propertyId,
        propertyName: r.propertyName,
        unitLabel: r.unitLabel,
        technicianName: null,
        createdAt: r.createdAt,
        visitFeePaise: 0,
      }))}
    />
  );
}
