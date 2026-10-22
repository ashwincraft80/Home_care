import { assertPaise, applyBps, sumPaise, type Paise } from "@/lib/money";
import { payoutPolicy } from "@/lib/config/site";
import type { LineItemKind } from "@/types/domain";

export interface LineItemInput {
  kind: LineItemKind;
  description: string;
  quantity: number;
  unitPricePaise: Paise;
}

export interface EstimateTotals {
  visitFeePaise: Paise;
  labourPaise: Paise;
  partsPaise: Paise;
  additionalPaise: Paise;
  totalPaise: Paise;
  lines: (LineItemInput & { totalPaise: Paise })[];
}

/** Computes an itemised estimate. Integer paise only — throws on invalid amounts. */
export function computeEstimate(visitFeePaise: Paise, items: LineItemInput[]): EstimateTotals {
  assertPaise(visitFeePaise, "visit fee");
  const lines = items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new RangeError("quantity must be a positive integer");
    assertPaise(item.unitPricePaise, "unit price");
    const totalPaise = item.quantity * item.unitPricePaise;
    if (!Number.isSafeInteger(totalPaise)) throw new RangeError("line total too large");
    return { ...item, totalPaise };
  });
  const byKind = (kind: LineItemKind) => sumPaise(lines.filter((l) => l.kind === kind).map((l) => l.totalPaise));
  const labourPaise = byKind("LABOUR");
  const partsPaise = byKind("PART");
  const additionalPaise = byKind("ADDITIONAL");
  return {
    visitFeePaise,
    labourPaise,
    partsPaise,
    additionalPaise,
    totalPaise: visitFeePaise + labourPaise + partsPaise + additionalPaise,
    lines,
  };
}

export interface ApprovedEstimateAmounts {
  kind: "INITIAL" | "SUPPLEMENTARY";
  visitFeePaise: Paise;
  labourPaise: Paise;
  partsPaise: Paise;
  additionalPaise: Paise;
}

/**
 * Invoice amounts for a completed job: the sum of approved estimates, or just the visit fee
 * if no estimate was approved (diagnosis-only visit).
 */
export function computeInvoiceAmounts(bookingVisitFeePaise: Paise, approved: ApprovedEstimateAmounts[]) {
  const hasInitial = approved.some((e) => e.kind === "INITIAL");
  const visitFeePaise = hasInitial ? sumPaise(approved.map((e) => e.visitFeePaise)) : bookingVisitFeePaise;
  const labourPaise = sumPaise(approved.map((e) => e.labourPaise));
  const partsPaise = sumPaise(approved.map((e) => e.partsPaise));
  const additionalPaise = sumPaise(approved.map((e) => e.additionalPaise));
  return {
    visitFeePaise,
    labourPaise,
    partsPaise,
    additionalPaise,
    totalPaise: visitFeePaise + labourPaise + partsPaise + additionalPaise,
  };
}

/** Transparent technician payout for a job, using the published payout policy. */
export function computePayout(amounts: { visitFeePaise: Paise; labourPaise: Paise; partsPaise: Paise; additionalPaise: Paise }) {
  const visit = applyBps(amounts.visitFeePaise, payoutPolicy.visitFeeShareBps);
  const labour = applyBps(amounts.labourPaise, payoutPolicy.labourShareBps);
  const parts = applyBps(amounts.partsPaise, payoutPolicy.partsReimbursementBps);
  const additional = applyBps(amounts.additionalPaise, payoutPolicy.additionalShareBps);
  const amountPaise = visit + labour + parts + additional;
  const grossPaise = amounts.visitFeePaise + amounts.labourPaise + amounts.partsPaise + amounts.additionalPaise;
  return {
    amountPaise,
    breakdown: {
      visitFeeSharePaise: visit,
      labourSharePaise: labour,
      partsReimbursementPaise: parts,
      additionalSharePaise: additional,
      platformFeePaise: grossPaise - amountPaise,
      policy: {
        visitFeeShareBps: payoutPolicy.visitFeeShareBps,
        labourShareBps: payoutPolicy.labourShareBps,
        partsReimbursementBps: payoutPolicy.partsReimbursementBps,
        additionalShareBps: payoutPolicy.additionalShareBps,
      },
    },
  };
}

/** What a technician is guaranteed for showing up, shown before they accept a job. */
export function guaranteedVisitPayout(visitFeePaise: Paise): Paise {
  return applyBps(visitFeePaise, payoutPolicy.visitFeeShareBps);
}
