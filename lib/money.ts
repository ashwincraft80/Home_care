/**
 * Money is always handled as integer paise. Never use floating point for amounts.
 */

export type Paise = number;

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of paise`);
  }
  return value;
}

export function rupeesToPaise(rupees: string | number): Paise {
  const text = typeof rupees === "number" ? rupees.toString() : rupees.trim().replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new RangeError(`Invalid rupee amount: ${rupees}`);
  const [whole, frac = ""] = text.split(".");
  return assertPaise(Number(whole) * 100 + Number(frac.padEnd(2, "0")));
}

const formatterWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
const formatterExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise as ₹1,234 (or ₹1,234.50 when there are paise). */
export function formatMoney(paise: Paise): string {
  if (paise % 100 === 0) return formatterWhole.format(paise / 100);
  return formatterExact.format(paise / 100);
}

export function formatMoneyRange(min: Paise | null, max: Paise | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${formatMoney(min)} – ${formatMoney(max)}`;
  return min != null ? `From ${formatMoney(min)}` : `Up to ${formatMoney(max!)}`;
}

/** Multiplies by a basis-point share, rounding half up to the nearest paisa. */
export function applyBps(amount: Paise, bps: number): Paise {
  assertPaise(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new RangeError("bps must be 0..10000");
  return Math.floor((amount * bps + 5000) / 10000);
}

export function sumPaise(values: Paise[]): Paise {
  return values.reduce((acc, v) => acc + assertPaise(v), 0);
}
