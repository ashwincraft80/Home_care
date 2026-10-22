import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActor } from "@/lib/auth/session";
import { AssetForm } from "@/features/assets/components/asset-form";
import { Card, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Add appliance" };

export default async function NewAssetPage() {
  await requireActor();
  return (
    <div className="max-w-3xl">
      <Link href="/account/assets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Home passport
      </Link>
      <PageHeader title="Add an appliance" description="Only the type and a name are required. Add dates if you know them to get service suggestions." />
      <Card className="p-6">
        <AssetForm />
      </Card>
    </div>
  );
}
