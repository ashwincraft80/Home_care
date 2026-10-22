import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listMyPayouts } from "@/features/technicians/service";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { payoutPolicy } from "@/lib/config/site";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Earnings" };
const tone = { PENDING: "warning", PROCESSING: "info", PAID: "success", ON_HOLD: "danger" } as const;

export default async function EarningsPage() {
  const actor = await requireActor("TECHNICIAN");
  const payouts = await listMyPayouts(await getDb(), actor);
  const sum = (s: string[]) => payouts.filter((p) => s.includes(p.status)).reduce((a, p) => a + p.amountPaise, 0);
  return (
    <>
      <PageHeader title="Earnings" description="Every payout is itemised. There are no deductions beyond the published platform share." />
      <Alert tone="info" title="How you're paid" className="mb-6">
        {payoutPolicy.summary} Payout cycle: {payoutPolicy.payoutCycle}. Payouts are recorded here; bank transfers are made by operations (no payment provider is connected yet).
      </Alert>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Pending", sum(["PENDING", "PROCESSING"])],
          ["On hold", sum(["ON_HOLD"])],
          ["Paid", sum(["PAID"])],
        ].map(([k, v]) => (
          <Card key={k as string} className="p-5">
            <p className="text-sm text-ink-muted">{k}</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{formatMoney(v as number)}</p>
          </Card>
        ))}
      </div>
      {payouts.length === 0 ? (
        <IllustratedEmpty scene="invoices" title="No payouts yet" body="A payout is created when the customer confirms a job is complete." />
      ) : (
        <Card>
          <CardHeader title="Payout history" />
          <CardBody className="divide-y divide-line p-0">
            {payouts.map((p) => (
              <details key={p.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold text-ink">{p.bookingReference}</span> <span className="text-sm text-ink-muted">· {p.categoryName} · {fmt.date(p.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatMoney(p.amountPaise)}</span>
                    <Badge tone={tone[p.status]}>{p.status.replace("_", " ").toLowerCase()}</Badge>
                  </span>
                </summary>
                <dl className="mt-3 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
                  <div className="flex justify-between sm:block">
                    <dt className="inline">Visit fee share: </dt>
                    <dd className="inline">{formatMoney(p.breakdown.visitFeeSharePaise)}</dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="inline">Labour share: </dt>
                    <dd className="inline">{formatMoney(p.breakdown.labourSharePaise)}</dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="inline">Parts reimbursed: </dt>
                    <dd className="inline">{formatMoney(p.breakdown.partsReimbursementPaise)}</dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt className="inline">Platform share: </dt>
                    <dd className="inline">{formatMoney(p.breakdown.platformFeePaise)}</dd>
                  </div>
                </dl>
                {p.note && <p className="mt-2 text-sm">Note from operations: {p.note}</p>}
                <Link href={`/tech/jobs/${p.bookingId}`} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">
                  View job
                </Link>
              </details>
            ))}
          </CardBody>
        </Card>
      )}
      <p className="mt-6 text-sm text-ink-muted">
        Something wrong with a payout?{" "}
        <Link href="/support/new?category=PAYOUT" className="font-semibold text-brand hover:underline">
          Raise a payout dispute
        </Link>
      </p>
    </>
  );
}
