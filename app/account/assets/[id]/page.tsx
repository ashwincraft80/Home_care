import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getAssetDetail } from "@/features/assets/service";
import { AssetDetailView } from "@/features/assets/components/asset-detail";

export const metadata: Metadata = { title: "Appliance" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const data = await getAssetDetail(await getDb(), actor, id);
  if (!data) notFound();
  return <AssetDetailView data={data} backHref="/account/assets" bookingHrefBase="/account/bookings" />;
}
