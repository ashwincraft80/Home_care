import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listMyProperties, listPropertyRequests } from "@/features/properties/service";
import { PropertyRequestList } from "@/features/properties/components/request-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Properties overview" };

export default async function PmHome() {
  const actor = await requireActor("PROPERTY_MANAGER");
  const db = await getDb();
  const [props, open] = await Promise.all([listMyProperties(db, actor), listPropertyRequests(db, actor, { open: true })]);
  const staffProps = props.filter((p) => p.memberRole !== "TENANT");
  const needsDecision = open.filter((r) => ["AWAITING_APPROVAL", "COMPLETION_PENDING"].includes(r.status));
  return (
    <>
      <PageHeader
        title="Your properties"
        description="Requests by unit, estimates waiting for approval, and every invoice in one place."
        actions={
          <>
            <Link href="/pm/properties/new" className={buttonClass("secondary", "md")}>
              <Plus className="size-4" aria-hidden /> Add property
            </Link>
            <Link href={staffProps[0] ? `/book?property=${staffProps[0].id}` : "/book"} className={buttonClass("primary", "md")}>
              New request
            </Link>
          </>
        }
      />
      {staffProps.length === 0 ? (
        <IllustratedEmpty scene="properties" title="No properties yet" body="Add a property and its units, then raise requests and invite tenants or co-managers." action={{ href: "/pm/properties/new", label: "Add your first property" }} />
      ) : (
        <div className="space-y-8">
          {needsDecision.length > 0 && (
            <section className="space-y-3" aria-labelledby="dec">
              <h2 id="dec" className="text-lg font-bold">
                Waiting for a decision ({needsDecision.length})
              </h2>
              <PropertyRequestList items={needsDecision} />
            </section>
          )}
          <section aria-labelledby="pl" className="space-y-3">
            <h2 id="pl" className="text-lg font-bold">
              Properties
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {staffProps.map((p) => (
                <li key={p.id}>
                  <Link href={`/pm/properties/${p.id}`} className="flex h-full items-start gap-3 rounded-[var(--radius-card)] glass glass-sheen glass-hover p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-ink">{p.name}</p>
                        <Badge tone="neutral">{p.memberRole.toLowerCase()}</Badge>
                        {!p.serviceAreaId && <Badge tone="warning">Outside service areas</Badge>}
                      </div>
                      <p className="text-sm text-ink-muted">
                        {p.line1}, {p.locality}
                      </p>
                      <p className="mt-3 text-sm text-ink-muted">
                        {p.unitCount} unit(s) · {p.openRequests} open request(s)
                        {p.awaitingApproval > 0 && <span className="font-semibold text-warning"> · {p.awaitingApproval} awaiting you</span>}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-ink-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="op" className="space-y-3">
            <h2 id="op" className="text-lg font-bold">
              Open requests ({open.length})
            </h2>
            {open.length ? <PropertyRequestList items={open} /> : <Card className="p-5 text-sm text-ink-muted">No open requests.</Card>}
          </section>
        </div>
      )}
    </>
  );
}
