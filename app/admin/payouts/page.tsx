import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listPayoutsAdmin, listUnpaidInvoices } from "@/features/admin/service";
import { markInvoicePaidAction, updatePayoutAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Payouts & invoices" };
const tone = { PENDING: "warning", PROCESSING: "info", PAID: "success", ON_HOLD: "danger" } as const;

export default async function PayoutsPage() {
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const [payouts, invoices] = await Promise.all([listPayoutsAdmin(db, actor), listUnpaidInvoices(db, actor)]);
  return (
    <>
      <PageHeader title="Payouts & invoices" description="Record professional payouts and customer payments. No payment provider is connected, so these are manual records." />
      <Alert tone="info" className="mb-6">
        Marking something paid here does not move money. Only record it after the bank transfer or customer payment has actually happened.
      </Alert>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Professional payouts" />
          <CardBody className="space-y-3">
            {payouts.length === 0 && <p className="text-sm text-ink-muted">No payouts yet.</p>}
            {payouts.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-semibold">{p.technicianName}</span> ·{" "}
                    <Link href={`/admin/bookings/${p.bookingId}`} className="text-brand hover:underline">
                      {p.bookingReference}
                    </Link>{" "}
                    · {fmt.date(p.createdAt)}
                  </p>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatMoney(p.amountPaise)}</span>
                    <Badge tone={tone[p.status]}>{p.status.replace("_", " ").toLowerCase()}</Badge>
                  </span>
                </div>
                {p.status !== "PAID" && (
                  <ActionForm action={updatePayoutAction as never} className="mt-2 flex flex-wrap items-center gap-2 space-y-0">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <Select name="status" defaultValue={p.status} aria-label="Payout status" className="h-9 w-40 text-sm">
                      <option value="PENDING">Pending</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="PAID">Paid</option>
                      <option value="ON_HOLD">On hold</option>
                    </Select>
                    <Input name="note" placeholder="Note (required for hold)" aria-label="Note" className="h-9 flex-1 text-sm" />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                      Update
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Unpaid customer invoices" />
          <CardBody className="space-y-2">
            {invoices.length === 0 && <p className="text-sm text-ink-muted">Nothing outstanding.</p>}
            {invoices.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                <span>
                  <span className="font-semibold">{i.number}</span> · {i.customerName} · {i.bookingReference} · {fmt.date(i.issuedAt)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatMoney(i.totalPaise)}</span>
                  <ActionForm action={markInvoicePaidAction as never} className="space-y-0">
                    <input type="hidden" name="invoiceId" value={i.id} />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                      Mark paid
                    </SubmitButton>
                  </ActionForm>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
