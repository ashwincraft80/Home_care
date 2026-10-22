"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { submitEstimateAction } from "@/features/bookings/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/surface";
import { formatMoney, rupeesToPaise } from "@/lib/money";

interface Row {
  kind: "LABOUR" | "PART" | "ADDITIONAL";
  description: string;
  quantity: string;
  unitPrice: string;
}

const blank = (kind: Row["kind"] = "LABOUR"): Row => ({ kind, description: "", quantity: "1", unitPrice: "" });

function safePaise(v: string) {
  try {
    return v ? rupeesToPaise(v) : 0;
  } catch {
    return 0;
  }
}

/** Mobile-friendly estimate builder. Totals shown here are a preview; the server recalculates. */
export function EstimateBuilder({ bookingId, visitFeePaise, supplementary }: { bookingId: string; visitFeePaise: number; supplementary: boolean }) {
  const [rows, setRows] = useState<Row[]>([blank("LABOUR"), blank("PART")]);
  const [state, action] = useActionState(submitEstimateAction, null);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const filled = rows.filter((r) => r.description.trim() && r.unitPrice);
  const totals = useMemo(() => {
    const sum = (k: Row["kind"]) => filled.filter((r) => r.kind === k).reduce((a, r) => a + safePaise(r.unitPrice) * (parseInt(r.quantity, 10) || 0), 0);
    const labour = sum("LABOUR"), parts = sum("PART"), additional = sum("ADDITIONAL");
    const fee = supplementary ? 0 : visitFeePaise;
    return { labour, parts, additional, fee, total: fee + labour + parts + additional };
  }, [filled, supplementary, visitFeePaise]);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  if (state?.ok) return <Alert tone="success">Estimate sent for {formatMoney(state.data.totalPaise)}. The customer will review it.</Alert>;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="items" value={JSON.stringify(filled)} />
      <Field label="Diagnosis" htmlFor="diagnosis" hint="What you found, in plain language." error={fe?.diagnosis}>
        <Textarea id="diagnosis" name="diagnosis" rows={2} required minLength={5} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Items</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line bg-surface-muted/50 p-3 sm:grid-cols-[120px_1fr_70px_110px_auto]">
            <label className="sr-only" htmlFor={`kind-${i}`}>
              Type
            </label>
            <Select id={`kind-${i}`} value={r.kind} onChange={(e) => update(i, { kind: e.target.value as Row["kind"] })} className="col-span-2 sm:col-span-1">
              <option value="LABOUR">Labour</option>
              <option value="PART">Part</option>
              <option value="ADDITIONAL">Additional</option>
            </Select>
            <label className="sr-only" htmlFor={`desc-${i}`}>
              Description
            </label>
            <Input id={`desc-${i}`} placeholder="Description" value={r.description} onChange={(e) => update(i, { description: e.target.value })} className="col-span-2 sm:col-span-1" />
            <label className="sr-only" htmlFor={`qty-${i}`}>
              Quantity
            </label>
            <Input id={`qty-${i}`} inputMode="numeric" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value.replace(/\D/g, "") })} aria-label="Quantity" />
            <label className="sr-only" htmlFor={`price-${i}`}>
              Unit price in rupees
            </label>
            <Input id={`price-${i}`} inputMode="decimal" placeholder="₹ each" value={r.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value.replace(/[^\d.]/g, "") })} />
            <Button type="button" variant="ghost" size="sm" aria-label="Remove item" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="h-11">
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {(["LABOUR", "PART", "ADDITIONAL"] as const).map((k) => (
            <Button key={k} type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, blank(k)])}>
              <Plus className="size-4" aria-hidden /> {k === "LABOUR" ? "Labour" : k === "PART" ? "Part" : "Additional"}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valid for (hours)" htmlFor="validityHours">
          <Select id="validityHours" name="validityHours" defaultValue="48">
            <option value="4">4 hours</option>
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
            <option value="72">72 hours</option>
          </Select>
        </Field>
        <Field label="Not included (optional)" htmlFor="exclusions">
          <Input id="exclusions" name="exclusions" placeholder="e.g. wall repair after opening" />
        </Field>
      </div>
      <div className="rounded-xl border border-white/70 bg-white/60 p-4 text-[15px]">
        {!supplementary && (
          <div className="flex justify-between text-ink-muted">
            <span>Visit fee (fixed at booking)</span>
            <span className="tabular-nums">{formatMoney(totals.fee)}</span>
          </div>
        )}
        <div className="flex justify-between text-ink-muted">
          <span>Labour · Parts · Additional</span>
          <span className="tabular-nums">
            {formatMoney(totals.labour)} · {formatMoney(totals.parts)} · {formatMoney(totals.additional)}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-bold">
          <span>Estimated total</span>
          <span className="tabular-nums">{formatMoney(totals.total)}</span>
        </div>
      </div>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton className="w-full sm:w-auto" size="lg" pendingLabel="Sending…" disabled={supplementary && filled.length === 0}>
        Send estimate to customer
      </SubmitButton>
    </form>
  );
}
