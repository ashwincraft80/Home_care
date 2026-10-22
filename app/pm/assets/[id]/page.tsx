import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getAssetDetail } from "@/features/assets/service";
import { getPropertyDetail } from "@/features/properties/service";
import { AssetDetailView } from "@/features/assets/components/asset-detail";

export const metadata: Metadata = { title: "Appliance" };

export default async function PmAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("PROPERTY_MANAGER");
  const db = await getDb();
  const data = await getAssetDetail(db, actor, id);
  if (!data || !data.asset.propertyId) notFound();
  const property = await getPropertyDetail(db, actor, data.asset.propertyId);
  return (
    <AssetDetailView
      data={data}
      backHref={`/pm/properties/${data.asset.propertyId}`}
      bookingHrefBase="/pm/requests"
      units={(property?.units ?? []).map((u) => ({ id: u.id, label: u.label }))}
    />
  );
}
