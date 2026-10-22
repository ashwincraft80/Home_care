import { describe, expect, it } from "vitest";
import { bookingInputSchema, estimateInputSchema, parseOrThrow, phoneSchema } from "@/lib/validation";
import { DomainError } from "@/lib/errors";
import { localDateKey, resolveSlot, upcomingSlots, zonedToUtc } from "@/lib/time";
import { sanitizeProps } from "@/lib/analytics";
import { nextServiceSuggestion } from "@/features/assets/service";

const valid = {
  categoryId: "10000000-0000-4000-8000-000000000999",
  problemDescription: "Tap is leaking under the sink",
  date: "2026-11-01",
  windowKey: "09-11",
  address: { line1: "12 Demo Street", pincode: "560038" },
  paymentMethod: "PAY_AFTER_SERVICE",
  idempotencyKey: "abcdefgh123",
  acceptPolicy: true,
};

describe("booking validation", () => {
  it("accepts a complete request", () => {
    expect(bookingInputSchema.safeParse(valid).success).toBe(true);
  });

  it("requires an address or property", () => {
    const r = bookingInputSchema.safeParse({ ...valid, address: undefined });
    expect(r.success).toBe(false);
  });

  it("rejects bad PIN codes and short descriptions (coverage is checked on the server)", () => {
    expect(bookingInputSchema.safeParse({ ...valid, address: { ...valid.address, pincode: "05603" } }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...valid, problemDescription: "leak" }).success).toBe(false);
  });

  it("requires explicit acceptance of pricing and cancellation terms", () => {
    expect(bookingInputSchema.safeParse({ ...valid, acceptPolicy: false }).success).toBe(false);
  });

  it("only allows landlord approval for rented homes", () => {
    expect(bookingInputSchema.safeParse({ ...valid, occupancy: "TENANT", costApproval: "LANDLORD", selfApprovalLimit: "300" }).success).toBe(true);
    expect(bookingInputSchema.safeParse({ ...valid, occupancy: "OWNER", costApproval: "LANDLORD" }).success).toBe(false);
  });

  it("does not allow online payment until a gateway is configured", () => {
    expect(bookingInputSchema.safeParse({ ...valid, paymentMethod: "ONLINE" }).success).toBe(false);
  });

  it("returns field errors through parseOrThrow", () => {
    try {
      parseOrThrow(bookingInputSchema, { ...valid, windowKey: "03-05" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).fieldErrors?.windowKey).toBeDefined();
    }
  });

  it("validates estimate amounts as rupee strings with at most 2 decimals", () => {
    const base = { bookingId: valid.categoryId, diagnosis: "Worn cartridge", items: [{ kind: "PART", description: "Cartridge", quantity: "2", unitPrice: "320.50" }] };
    expect(estimateInputSchema.safeParse(base).success).toBe(true);
    expect(estimateInputSchema.safeParse({ ...base, items: [{ ...base.items[0], unitPrice: "3.333" }] }).success).toBe(false);
    expect(estimateInputSchema.safeParse({ ...base, items: [{ ...base.items[0], quantity: "0" }] }).success).toBe(false);
  });

  it("normalises Indian mobile numbers", () => {
    expect(phoneSchema.parse("98450 12345")).toBe("9845012345");
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });
});

describe("time zone handling", () => {
  it("converts IST wall-clock to UTC", () => {
    expect(zonedToUtc("2026-10-22", "09:00").toISOString()).toBe("2026-10-22T03:30:00.000Z");
    expect(localDateKey(new Date("2026-10-21T20:00:00Z"))).toBe("2026-10-22");
  });

  it("only offers windows after the lead time", () => {
    const now = new Date("2026-10-22T03:00:00Z"); // 08:30 IST
    const slots = upcomingSlots(now);
    expect(slots[0].start.getTime()).toBeGreaterThanOrEqual(now.getTime() + 120 * 60000);
    expect(resolveSlot("2026-10-22", "99-99")).toBeNull();
  });
});

describe("analytics privacy", () => {
  it("drops unknown keys and contact-like values", () => {
    expect(sanitizeProps({ category: "plumbing", email: "a@b.com", phone: "9845012345", status: "x@y" })).toEqual({ category: "plumbing" });
  });
});

describe("service guidance", () => {
  it("suggests the next service from the last service date", () => {
    expect(nextServiceSuggestion({ assetType: "AC", lastServicedOn: "2026-01-01", installedOn: null }, "2026-10-22")).toMatchObject({
      nextServiceOn: "2026-06-30",
      overdue: true,
      basis: "last_service",
    });
    expect(nextServiceSuggestion({ assetType: "REFRIGERATOR", lastServicedOn: "2026-01-01", installedOn: null }).nextServiceOn).toBeNull();
  });
});
