import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listMyProperties, listPropertyRequests } from "@/features/properties/service";
import { PropertyRequestList } from "@/features/properties/components/request-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { PageHeader } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Requests" };

export default async function PmRequestsPage({ searchParams }: { searchParams: Promise<{ property?: string; show?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor("PROPERTY_MANAGER");
  const db = await getDb();
  const props = (await listMyProperties(db, actor)).filter((p) => p.memberRole !== "TENANT");
  const propertyId = props.some((p) => p.id === sp.property) ? sp.property : undefined;
  const open = sp.show !== "all";
  const requests = await listPropertyRequests(db, actor, { propertyId, open });
  const href = (q: Record<string, string | undefined>) => `/pm/requests?${new URLSearchParams(Object.entries({ property: propertyId, show: open ? undefined : "all", ...q }).filter(([, v]) => v) as [string, string][])}`;
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-sm font-semibold", active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted hover:text-ink");
  return (
    <>
      <PageHeader title="Maintenance requests" description="Status by property and unit. Estimates above a manager's limit wait for the owner." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={href({ property: undefined })} className={chip(!propertyId)}>
          All properties
        </Link>
        {props.map((p) => (
          <Link key={p.id} href={href({ property: p.id })} className={chip(propertyId === p.id)}>
            {p.name}
          </Link>
        ))}
        <span className="mx-1 w-px bg-line" aria-hidden />
        <Link href={href({ show: undefined })} className={chip(open)}>
          Open
        </Link>
        <Link href={href({ show: "all" })} className={chip(!open)}>
          All
        </Link>
      </div>
      {requests.length ? <PropertyRequestList items={requests} /> : <IllustratedEmpty scene="bookings" title="No requests here" body="Raise a request from a property page." />}
    </>
  );
}
