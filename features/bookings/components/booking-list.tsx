import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BookingSummary } from "@/features/bookings/queries";
import { ServiceTile, StatusBadge } from "@/components/domain/brand";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/time";

export function BookingList({ items, hrefBase, dict, showProperty, extra }: { items: BookingSummary[]; hrefBase: string; dict?: Dictionary; showProperty?: boolean; extra?: (b: BookingSummary) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] glass glass-sheen">
      {items.map((b) => (
        <li key={b.id}>
          <Link href={`${hrefBase}/${b.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/50 sm:px-5">
            <ServiceTile icon={b.categoryIcon} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-bold text-ink">{b.categoryName}</p>
                <StatusBadge status={b.status} dict={dict} />
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-muted">
                {fmt.window(b.slotStart, b.slotEnd)} · {showProperty && b.propertyName ? `${b.propertyName}${b.unitLabel ? ` · ${b.unitLabel}` : ""}` : b.locality} · {b.reference}
                {b.technicianName ? ` · ${b.technicianName}` : ""}
              </p>
              {extra?.(b)}
            </div>
            <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
