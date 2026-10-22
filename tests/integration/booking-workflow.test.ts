import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database/types";
import { DomainError } from "@/lib/errors";
import {
  acceptOffer,
  adminAssign,
  adminConfirm,
  cancelBooking,
  createBooking,
  declineOffer,
  technicianProgress,
} from "@/features/bookings/service";
import { confirmCompletion, disputeBooking, submitCompletion } from "@/features/bookings/completion";
import { decideEstimate, submitEstimate } from "@/features/estimates/service";
import { getBookingDetail, listOpenOffers } from "@/features/bookings/queries";
import { createComplaint, getComplaint, listMyComplaints } from "@/features/complaints/service";
import { actorFor, bookingPayload, categoryId, createTestDb, demoUsers, futureSlot, idemKey } from "../support/db";
import type { Actor } from "@/types/domain";

let db: Database;
let asha: Actor, newbie: Actor, ravi: Actor, imran: Actor, admin: Actor, applicant: Actor;
let electrician: string;

async function expectDomainError(p: Promise<unknown>, code?: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    if (code) expect((e as DomainError).code).toBe(code);
    return e as DomainError;
  }
  throw new Error("Expected a DomainError");
}

beforeAll(async () => {
  db = await createTestDb();
  [asha, newbie, ravi, imran, admin, applicant] = await Promise.all(
    [demoUsers.customer, demoUsers.newCustomer, demoUsers.ravi, demoUsers.imran, demoUsers.admin, demoUsers.applicant].map((id) => actorFor(db, id)),
  );
  electrician = await categoryId(db, "electrician");
});

describe("booking submission", () => {
  it("creates a booking with a reference, price snapshot and history", async () => {
    const res = await createBooking(db, newbie, bookingPayload(electrician));
    expect(res.reference).toMatch(/^HC-[A-Z0-9]{6}$/);
    expect(res.duplicate).toBe(false);
    const detail = await getBookingDetail(db, newbie, res.id);
    expect(detail?.booking.status).toBe("REQUESTED");
    expect(detail?.booking.visitFeePaise).toBe(14900);
    expect(detail?.history.map((h) => h.toStatus)).toEqual(["REQUESTED"]);
    expect(detail?.location?.line1).toBe("House 12, Demo Street");
  });

  it("returns the original booking for a duplicate submission (same idempotency key)", async () => {
    const payload = bookingPayload(electrician, { date: futureSlot(4).date, windowKey: "09-11" });
    const first = await createBooking(db, newbie, payload);
    const second = await createBooking(db, newbie, payload);
    expect(second).toEqual({ ...first, duplicate: true });
  });

  it("blocks a second open booking for the same service and window", async () => {
    const slot = futureSlot(4, "14-16");
    await createBooking(db, newbie, bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey }));
    await expectDomainError(
      createBooking(db, newbie, bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey, idempotencyKey: idemKey() })),
      "CONFLICT",
    );
  });

  it("limits window capacity to the professionals actually available", async () => {
    // Only one electrician (Ravi) serves Indiranagar, so the second request for the same window is refused.
    const slot = futureSlot(3, "16-18");
    await createBooking(db, asha, bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey }));
    const e = await expectDomainError(createBooking(db, imran, bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey })), "CONFLICT");
    expect(e.message).toMatch(/filled up/);
    // Nobody offers electrical work in the evening window.
    const evening = await expectDomainError(createBooking(db, newbie, bookingPayload(electrician, { date: slot.date, windowKey: "18-20" })), "CONFLICT");
    expect(evening.message).toMatch(/No professional/);
  });

  it("rejects invalid input and past windows", async () => {
    const e = await expectDomainError(createBooking(db, newbie, bookingPayload(electrician, { problemDescription: "short" })), "VALIDATION");
    expect(e.fieldErrors?.problemDescription).toBeDefined();
    await expectDomainError(createBooking(db, newbie, bookingPayload(electrician, { date: "2020-01-01" })), "VALIDATION");
    await expectDomainError(
      createBooking(db, newbie, bookingPayload(electrician, { address: { line1: "x", pincode: "1" } })),
      "VALIDATION",
    );
  });

  it("does not let a customer attach another person's appliance", async () => {
    const ashaAsset = (await db.query<{ id: string }>(`select id from assets where owner_id = $1 limit 1`, [demoUsers.customer]))[0].id;
    await expectDomainError(createBooking(db, newbie, bookingPayload(electrician, { assetId: ashaAsset, date: futureSlot(3, "09-11").date, windowKey: "09-11" })), "FORBIDDEN");
  });

  it("does not let a customer book for a property they don't manage", async () => {
    const lakeview = (await db.query<{ id: string }>(`select id from properties where name like 'Lakeview%'`))[0].id;
    await expectDomainError(
      createBooking(db, newbie, bookingPayload(electrician, { propertyId: lakeview, address: undefined, date: futureSlot(2).date })),
      "FORBIDDEN",
    );
  });
});

describe("full job lifecycle", () => {
  let bookingId: string;

  it("runs request → confirm → offer → accept → estimate → approval → completion → confirmation", async () => {
    const slot = futureSlot(2, "11-13");
    const created = await createBooking(
      db,
      newbie,
      bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey, address: { line1: "House 9, Demo Road", pincode: "560034" } }),
    );
    bookingId = created.id;

    // Technicians can't accept before operations confirms.
    await expectDomainError(acceptOffer(db, ravi, bookingId), "CONFLICT");
    // Customers can't confirm their own booking.
    await expectDomainError(adminConfirm(db, newbie, bookingId), "FORBIDDEN");
    await adminConfirm(db, admin, bookingId);

    // Ravi (electrician, Koramangala) sees the offer with locality only; Imran (no electrician skill) does not.
    expect((await listOpenOffers(db, ravi)).some((o) => o.id === bookingId)).toBe(true);
    expect((await listOpenOffers(db, imran)).some((o) => o.id === bookingId)).toBe(false);
    const offerView = await getBookingDetail(db, ravi, bookingId);
    expect(offerView?.access).toBe("offer");
    expect(offerView?.location).toBeNull();
    expect(offerView?.customer).toBeNull();

    // A pending (unapproved) technician cannot accept.
    await expectDomainError(acceptOffer(db, applicant, bookingId), "FORBIDDEN");
    await acceptOffer(db, ravi, bookingId);
    await expectDomainError(acceptOffer(db, ravi, bookingId), "CONFLICT");

    const assigned = await getBookingDetail(db, ravi, bookingId);
    expect(assigned?.access).toBe("full");
    expect(assigned?.location?.line1).toBe("House 9, Demo Road");
    expect(assigned?.customer?.phone).toBe("+910000000003");

    // Customer cannot move technician statuses.
    await expectDomainError(technicianProgress(db, newbie, bookingId, "EN_ROUTE"), "INVALID_TRANSITION");
    await technicianProgress(db, ravi, bookingId, "EN_ROUTE");
    await technicianProgress(db, ravi, bookingId, "IN_PROGRESS");

    // Another technician cannot submit an estimate for this job.
    await expectDomainError(
      submitEstimate(db, imran, { bookingId, diagnosis: "Not my job", items: [] }),
      "NOT_FOUND",
    );
    const est = await submitEstimate(db, ravi, {
      bookingId,
      diagnosis: "Loose terminal in the switchboard",
      items: [
        { kind: "LABOUR", description: "Rewire switchboard", quantity: 1, unitPrice: "250" },
        { kind: "PART", description: "6A modular switch", quantity: 2, unitPrice: "85.50" },
      ],
    });
    expect(est.totalPaise).toBe(14900 + 25000 + 17100);

    // A second estimate cannot be opened while one is pending.
    await expectDomainError(submitEstimate(db, ravi, { bookingId, diagnosis: "Another one", items: [] }), "INVALID_TRANSITION");

    // Other customers cannot decide; the right customer must confirm the exact total they saw.
    await expectDomainError(decideEstimate(db, asha, { estimateId: est.estimateId, decision: "APPROVED", expectedTotalPaise: est.totalPaise }), "NOT_FOUND");
    await expectDomainError(decideEstimate(db, newbie, { estimateId: est.estimateId, decision: "APPROVED", expectedTotalPaise: est.totalPaise - 1 }), "CONFLICT");
    await decideEstimate(db, newbie, { estimateId: est.estimateId, decision: "APPROVED", expectedTotalPaise: est.totalPaise });
    await expectDomainError(decideEstimate(db, newbie, { estimateId: est.estimateId, decision: "REJECTED", expectedTotalPaise: est.totalPaise }), "CONFLICT");

    const approval = await db.query<{ decided_by: string; total_paise_at_decision: number }>(
      `select decided_by, total_paise_at_decision from estimate_approvals where estimate_id = $1`,
      [est.estimateId],
    );
    expect(approval[0]).toEqual({ decided_by: newbie.userId, total_paise_at_decision: est.totalPaise });

    // The database refuses any attempt to change an approved total, even with owner privileges.
    await expect(db.query(`update estimates set total_paise = total_paise + 100, labour_paise = labour_paise + 100 where id = $1`, [est.estimateId])).rejects.toThrow();
    await expect(db.query(`insert into estimate_line_items (estimate_id, kind, description, quantity, unit_price_paise, total_paise) values ($1, 'PART', 'Sneaky', 1, 100, 100)`, [est.estimateId])).rejects.toThrow();

    // Technician submits completion; this does NOT complete the booking.
    await submitCompletion(db, ravi, {
      bookingId,
      workSummary: "Rewired the switchboard and replaced two switches.",
      checklist: { workAreaCleaned: true, customerShownWork: true, oldPartsHandedOver: true, testedAfterRepair: true },
    });
    let detail = await getBookingDetail(db, newbie, bookingId);
    expect(detail?.booking.status).toBe("COMPLETION_PENDING");
    expect(detail?.invoice).toBeNull();

    // Technician can't confirm their own work; admin can't close before the confirmation window.
    await expectDomainError(confirmCompletion(db, ravi, bookingId), "INVALID_TRANSITION");
    await expectDomainError(confirmCompletion(db, admin, bookingId), "INVALID_TRANSITION");

    await confirmCompletion(db, newbie, bookingId);
    detail = await getBookingDetail(db, newbie, bookingId);
    expect(detail?.booking.status).toBe("COMPLETED");
    expect(detail?.invoice?.totalPaise).toBe(est.totalPaise);
    expect(detail?.invoice?.warrantyDays).toBe(30);

    const record = await db.query<{ source: string; owner_id: string }>(`select source, owner_id from maintenance_records where booking_id = $1`, [bookingId]);
    expect(record).toEqual([{ source: "JOB", owner_id: newbie.userId }]);
    const payout = await db.query<{ amount_paise: number; status: string }>(`select amount_paise, status from technician_payouts where booking_id = $1`, [bookingId]);
    expect(payout[0].status).toBe("PENDING");
    expect(payout[0].amount_paise).toBe(11920 + 20000 + 17100);
  });

  it("lets operations close a job only after the customer's confirmation window", async () => {
    const b4 = "10000000-0000-4000-8000-000000000204"; // seeded COMPLETION_PENDING, submitted 20h ago
    await expectDomainError(confirmCompletion(db, admin, b4), "INVALID_TRANSITION");
    await confirmCompletion(db, admin, b4, new Date(Date.now() + 30 * 3600000));
    const d = await getBookingDetail(db, asha, b4);
    expect(d?.booking.status).toBe("COMPLETED");
    expect(d?.completion?.confirmedByRole).toBe("ADMIN");
  });
});

describe("estimate rejection and approval limits", () => {
  it("lets a customer reject, returning the job to in-progress", async () => {
    const b2 = "10000000-0000-4000-8000-000000000202";
    const est = (await db.query<{ id: string; total_paise: number }>(`select id, total_paise from estimates where booking_id = $1`, [b2]))[0];
    await decideEstimate(db, asha, { estimateId: est.id, decision: "REJECTED", expectedTotalPaise: est.total_paise, reason: "Will buy the part myself" });
    const d = await getBookingDetail(db, asha, b2);
    expect(d?.booking.status).toBe("IN_PROGRESS");
    expect(d?.estimates[0].status).toBe("REJECTED");
    expect(d?.estimates[0].approval?.decidedByName).toBe("Asha Rao (Demo)");
  });

  it("stops a property manager approving above their limit, but lets the owner approve", async () => {
    const karthik = await actorFor(db, demoUsers.karthik);
    const meera = await actorFor(db, demoUsers.meera);
    const b6 = "10000000-0000-4000-8000-000000000206";
    const est = (await db.query<{ id: string; total_paise: number }>(`select id, total_paise from estimates where booking_id = $1`, [b6]))[0];
    expect(est.total_paise).toBeGreaterThan(200000);
    const view = await getBookingDetail(db, karthik, b6);
    expect(view?.estimates[0].viewerCanApprove).toBe(false);
    await expectDomainError(decideEstimate(db, karthik, { estimateId: est.id, decision: "APPROVED", expectedTotalPaise: est.total_paise }), "FORBIDDEN");
    await decideEstimate(db, meera, { estimateId: est.id, decision: "APPROVED", expectedTotalPaise: est.total_paise });
    const approval = await db.query<{ decided_by_role: string }>(`select decided_by_role from estimate_approvals where estimate_id = $1`, [est.id]);
    expect(approval[0].decided_by_role).toBe("PROPERTY_OWNER");
  });
});

describe("cancellation and technician fairness", () => {
  it("records a free cancellation before the cut-off and blocks cancelling twice", async () => {
    const res = await createBooking(db, newbie, bookingPayload(electrician, { date: futureSlot(3, "11-13").date, windowKey: "11-13" }));
    const out = await cancelBooking(db, newbie, res.id, "Plans changed");
    expect(out.feePaise).toBe(0);
    await expectDomainError(cancelBooking(db, newbie, res.id, "again"), "INVALID_TRANSITION");
    await expectDomainError(cancelBooking(db, asha, res.id, "not mine"), "NOT_FOUND");
  });

  it("prevents a technician being double-booked in the same window", async () => {
    const slot = futureSlot(1, "09-11");
    const a = await createBooking(db, newbie, bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey }));
    const plumbing = await categoryId(db, "plumbing");
    const b = await createBooking(db, asha, bookingPayload(plumbing, { date: slot.date, windowKey: slot.windowKey, problemDescription: "Bathroom tap is dripping continuously." }));
    await adminAssign(db, admin, a.id, ravi.userId);
    const err = await expectDomainError(adminAssign(db, admin, b.id, ravi.userId), "CONFLICT");
    expect(err.message).toMatch(/already has a job/);
  });

  it("lets a technician decline an offer without it being assigned", async () => {
    const res = await createBooking(db, newbie, bookingPayload(electrician, { date: futureSlot(1, "16-18").date, windowKey: "16-18", address: { line1: "Flat 1, Demo", pincode: "560102" } }));
    await adminConfirm(db, admin, res.id);
    expect((await listOpenOffers(db, ravi)).some((o) => o.id === res.id)).toBe(true);
    await declineOffer(db, ravi, res.id, "Too far today");
    expect((await listOpenOffers(db, ravi)).some((o) => o.id === res.id)).toBe(false);
    // Another eligible technician still sees it.
    const suresh = await actorFor(db, demoUsers.suresh);
    expect((await listOpenOffers(db, suresh)).some((o) => o.id === res.id)).toBe(true);
  });
});

describe("complaints and disputes", () => {
  it("creates a complaint the raiser can track and others cannot see", async () => {
    const c = await createComplaint(db, newbie, { category: "OTHER", description: "I was charged twice for the same visit." });
    expect(c.reference).toMatch(/^CM-/);
    expect((await listMyComplaints(db, newbie)).map((x) => x.id)).toContain(c.id);
    expect(await getComplaint(db, asha, c.id)).toBeNull();
    expect((await getComplaint(db, admin, c.id))?.description).toMatch(/charged twice/);
  });

  it("refuses complaints about bookings the user is not part of", async () => {
    await expectDomainError(
      createComplaint(db, newbie, { bookingId: "10000000-0000-4000-8000-000000000201", category: "QUALITY", description: "Not my booking at all" }),
      "NOT_FOUND",
    );
  });

  it("disputing a completion moves the booking to DISPUTED and opens a complaint", async () => {
    const slot = futureSlot(1, "11-13");
    const res = await createBooking(db, newbie, bookingPayload(electrician, { date: slot.date, windowKey: slot.windowKey }));
    await adminAssign(db, admin, res.id, ravi.userId);
    await technicianProgress(db, ravi, res.id, "EN_ROUTE");
    await technicianProgress(db, ravi, res.id, "IN_PROGRESS");
    await submitCompletion(db, ravi, {
      bookingId: res.id,
      workSummary: "Checked wiring.",
      checklist: { workAreaCleaned: true, customerShownWork: false, oldPartsHandedOver: false, testedAfterRepair: true },
    });
    const d = await disputeBooking(db, newbie, res.id, "QUALITY", "The light still flickers after the visit.");
    const detail = await getBookingDetail(db, newbie, res.id);
    expect(detail?.booking.status).toBe("DISPUTED");
    expect(detail?.complaints[0].id).toBe(d.complaintId);
    expect(detail?.invoice).toBeNull();
  });
});
