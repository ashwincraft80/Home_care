import { describe, expect, it } from "vitest";
import { applyBps, formatMoney, rupeesToPaise } from "@/lib/money";
import { computeEstimate, computeInvoiceAmounts, computePayout, guaranteedVisitPayout } from "@/features/estimates/calc";

describe("money", () => {
  it("parses rupee strings into integer paise without floating point error", () => {
    expect(rupeesToPaise("450")).toBe(45000);
    expect(rupeesToPaise("450.5")).toBe(45050);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("1,299.99")).toBe(129999);
    expect(() => rupeesToPaise("12.345")).toThrow();
    expect(() => rupeesToPaise("-5")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
  });

  it("formats paise in Indian currency style", () => {
    expect(formatMoney(14900)).toBe("₹149");
    expect(formatMoney(12345678)).toBe("₹1,23,456.78");
  });

  it("applies basis points with integer rounding", () => {
    expect(applyBps(14900, 8000)).toBe(11920);
    expect(applyBps(999, 8000)).toBe(799); // 799.2 -> 799
    expect(applyBps(1, 5000)).toBe(1); // 0.5 rounds half up
    expect(() => applyBps(100, 10001)).toThrow();
  });
});

describe("estimate totals", () => {
  it("sums labour, parts and additional charges with the visit fee", () => {
    const t = computeEstimate(14900, [
      { kind: "LABOUR", description: "Replace cartridge", quantity: 1, unitPricePaise: 25000 },
      { kind: "PART", description: "Cartridge", quantity: 2, unitPricePaise: 32050 },
      { kind: "ADDITIONAL", description: "Sealant", quantity: 1, unitPricePaise: 1999 },
    ]);
    expect(t.labourPaise).toBe(25000);
    expect(t.partsPaise).toBe(64100);
    expect(t.additionalPaise).toBe(1999);
    expect(t.totalPaise).toBe(14900 + 25000 + 64100 + 1999);
    expect(t.lines[1].totalPaise).toBe(64100);
  });

  it("rejects fractional quantities and negative or fractional paise", () => {
    expect(() => computeEstimate(100, [{ kind: "PART", description: "x", quantity: 1.5, unitPricePaise: 100 }])).toThrow();
    expect(() => computeEstimate(100, [{ kind: "PART", description: "x", quantity: 1, unitPricePaise: -1 }])).toThrow();
    expect(() => computeEstimate(100, [{ kind: "PART", description: "x", quantity: 1, unitPricePaise: 10.5 }])).toThrow();
    expect(() => computeEstimate(-1, [])).toThrow();
  });

  it("invoices the visit fee only when no estimate was approved", () => {
    expect(computeInvoiceAmounts(14900, []).totalPaise).toBe(14900);
  });

  it("invoices approved initial + supplementary estimates without double-charging the visit fee", () => {
    const amounts = computeInvoiceAmounts(14900, [
      { kind: "INITIAL", visitFeePaise: 14900, labourPaise: 30000, partsPaise: 10000, additionalPaise: 0 },
      { kind: "SUPPLEMENTARY", visitFeePaise: 0, labourPaise: 5000, partsPaise: 0, additionalPaise: 2000 },
    ]);
    expect(amounts).toEqual({ visitFeePaise: 14900, labourPaise: 35000, partsPaise: 10000, additionalPaise: 2000, totalPaise: 61900 });
  });

  it("computes a transparent payout where the platform fee is the exact remainder", () => {
    const p = computePayout({ visitFeePaise: 14900, labourPaise: 30000, partsPaise: 10000, additionalPaise: 1000 });
    expect(p.breakdown.partsReimbursementPaise).toBe(10000);
    expect(p.amountPaise + p.breakdown.platformFeePaise).toBe(14900 + 30000 + 10000 + 1000);
    expect(guaranteedVisitPayout(14900)).toBe(11920);
  });
});
