import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listInvoicesForCustomer } from "@/features/bookings/queries";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { formatMoney } from "@/lib/money";
import { fmt, localDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Invoices & warranty" };

export default async function InvoicesPage() {
  const actor = await requireActor();
  const invoices = await listInvoicesForCustomer(await getDb(), actor);
  const today = localDateKey(new Date());
  return (
    <>
      <PageHeader title="Invoices & warranty" description="Every invoice from a confirmed job, with its workmanship warranty and exclusions." />
      {invoices.length === 0 ? (
        <IllustratedEmpty scene="invoices" title="No invoices yet" body="Invoices are issued when you confirm a job is complete." action={{ href: "/book", label: "Book a service" }} />
      ) : (
        <Card className="divide-y divide-line">
          {invoices.map((i) => {
            const active = i.warrantyExpiresOn && i.warrantyExpiresOn >= today;
            return (
              <div key={i.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-bold text-ink">
                    {i.number} · {i.categoryName}
                  </p>
                  <p className="text-sm text-ink-muted">
                    Issued {fmt.date(i.issuedAt)} ·{" "}
                    <Link href={`/account/bookings/${i.bookingId}`} className="font-semibold text-brand hover:underline">
                      {i.bookingReference}
                    </Link>
                  </p>
                  {i.warrantyDays > 0 && (
                    <p className="mt-1 text-sm text-ink-muted">
                      Workmanship warranty {active ? `until ${fmt.date(i.warrantyExpiresOn!)}` : `ended ${i.warrantyExpiresOn ? fmt.date(i.warrantyExpiresOn) : ""}`}
                      {active && (
                        <>
                          {" · "}
                          <Link href={`/support/new?booking=${i.bookingId}&category=WARRANTY_CLAIM`} className="font-semibold text-brand hover:underline">
                            Make a warranty claim
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-semibold tabular-nums">{formatMoney(i.totalPaise)}</p>
                  <Badge tone={i.paymentStatus === "PAID" ? "success" : "warning"}>{i.paymentStatus === "PAID" ? "Paid" : "Payment due"}</Badge>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
