import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listPropertyInvoices } from "@/features/properties/service";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Invoices & history" };

export default async function PmInvoicesPage() {
  const actor = await requireActor("PROPERTY_MANAGER");
  const invoices = await listPropertyInvoices(await getDb(), actor);
  const total = invoices.reduce((a, i) => a + i.totalPaise, 0);
  return (
    <>
      <PageHeader title="Invoices & maintenance history" description={`${invoices.length} invoice(s) · ${formatMoney(total)} in total across your properties.`} />
      {invoices.length === 0 ? (
        <IllustratedEmpty scene="invoices" title="No invoices yet" body="Invoices appear when a request is confirmed complete." />
      ) : (
        <Card className="divide-y divide-line">
          {invoices.map((i) => (
            <Link key={i.id} href={`/pm/requests/${i.bookingId}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-muted">
              <div>
                <p className="font-bold">
                  {i.number} · {i.categoryName}
                </p>
                <p className="text-sm text-ink-muted">
                  {i.propertyName} · {i.bookingReference} · {fmt.date(i.issuedAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{formatMoney(i.totalPaise)}</span>
                <Badge tone={i.paymentStatus === "PAID" ? "success" : "warning"}>{i.paymentStatus === "PAID" ? "Paid" : "Due"}</Badge>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
