import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { listActiveCategories } from "@/features/catalog/service";
import { ServiceTile } from "@/components/domain/brand";
import { MobileBookBar } from "@/components/domain/site-chrome";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { getDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Services", description: "Home services with the visit fee shown upfront." };

export default async function ServicesPage() {
  const [dict, categories] = await Promise.all([getDictionary(), getDb().then(listActiveCategories)]);
  return (
    <div className="container-page py-12 sm:py-16">
      <h1 className="font-display text-[40px] font-semibold text-ink sm:text-[48px]">{dict.home.servicesTitle}</h1>
      <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">{dict.home.servicesSubtitle} Availability depends on your area — check your pincode when you book.</p>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={`/services/${c.slug}`} className="flex h-full gap-4 rounded-[var(--radius-card)] glass glass-sheen glass-hover p-6">
              <ServiceTile icon={c.icon} size="lg" />
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-ink">{c.name}</h2>
                <p className="mt-1 text-[15px] text-ink-muted">{c.shortDescription}</p>
                <p className="mt-3 text-sm text-ink-muted">
                  Visit fee <strong className="text-ink">{formatMoney(c.visitFeePaise)}</strong>
                  {formatMoneyRange(c.indicativeMinPaise, c.indicativeMaxPaise) && <> · typical jobs {formatMoneyRange(c.indicativeMinPaise, c.indicativeMaxPaise)}</>}
                  {c.warrantyDays > 0 && <> · {c.warrantyDays}-day workmanship warranty</>}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="h-20 sm:hidden" aria-hidden />
      <MobileBookBar label={dict.nav.book} />
    </div>
  );
}
