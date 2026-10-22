import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";
import { listActiveCategories } from "@/features/catalog/service";
import { listMyProperties, getPropertyDetail } from "@/features/properties/service";
import { assetsForBooking } from "@/features/assets/service";
import { BookingWizard, type WizardProperty } from "@/features/bookings/components/booking-wizard";
import { cancellationPolicy } from "@/lib/config/site";

export const metadata: Metadata = { title: "Book a service" };

export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const [dict, db] = await Promise.all([getDictionary(), getDb()]);
  const [categories, props, ownAssets, addresses] = await Promise.all([
    listActiveCategories(db),
    listMyProperties(db, actor),
    assetsForBooking(db, actor, null),
    db.asUser(actor.userId, (tx) =>
      tx.query<{ id: string; label: string; line1: string; pincode: string; locality: string }>(
        `select id, label, line1, pincode, locality from addresses where profile_id = $1 order by created_at desc`,
        [actor.userId],
      ),
    ),
  ]);
  const requestable = props.filter((p) => p.memberRole !== "VIEWER");
  const properties: WizardProperty[] = [];
  const propertyAssets: { id: string; nickname: string; assetType: string; propertyId: string | null; unitId: string | null }[] = [];
  for (const p of requestable) {
    const d = await getPropertyDetail(db, actor, p.id);
    properties.push({
      id: p.id,
      name: p.name,
      memberRole: p.memberRole,
      pincode: p.pincode,
      locality: p.locality,
      tenantUnitId: d?.membership?.memberRole === "TENANT" ? (d.membership.unitId ?? null) : null,
      units: (d?.units ?? []).map((u) => ({ id: u.id, label: u.label })),
    });
    const pa = await assetsForBooking(db, actor, p.id);
    propertyAssets.push(...pa.map((a) => ({ ...a, propertyId: p.id })));
  }

  return (
    <div className="container-page max-w-5xl py-8 sm:py-12">
      <h1 className="font-display text-[32px] font-semibold text-ink">{dict.booking.title}</h1>
      <p className="mt-1 text-ink-muted">Takes about a minute. You&apos;ll see the visit fee and terms before you confirm.</p>
      <div className="mt-8">
        <BookingWizard
          t={dict.booking}
          categories={categories.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            icon: c.icon,
            shortDescription: c.shortDescription,
            visitFeePaise: c.visitFeePaise,
            indicativeMinPaise: c.indicativeMinPaise,
            indicativeMaxPaise: c.indicativeMaxPaise,
            commonJobs: c.commonJobs,
            warrantyDays: c.warrantyDays,
            assetTypes: c.assetTypes,
          }))}
          savedAddresses={addresses}
          properties={properties}
          assets={[...ownAssets.map((a) => ({ ...a, propertyId: null })), ...propertyAssets]}
          initial={{
            categorySlug: sp.category,
            issue: sp.issue?.slice(0, 120),
            pincode: sp.pincode && /^\d{6}$/.test(sp.pincode) ? sp.pincode : undefined,
            propertyId: sp.property,
            assetId: sp.asset,
            repeat: sp.repeat === "1",
          }}
          cancellationSummary={cancellationPolicy.summary}
        />
      </div>
    </div>
  );
}
