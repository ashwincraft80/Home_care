import type { Metadata } from "next";
import { requireActor } from "@/lib/auth/session";
import { PropertyForm } from "@/features/properties/components/property-form";
import { Card, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Add property" };

export default async function NewPropertyPage() {
  await requireActor("PROPERTY_MANAGER");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add a property" description="You'll be its owner on HomeCare. Add units and invite tenants or co-managers next." />
      <Card className="p-6">
        <PropertyForm />
      </Card>
    </div>
  );
}
