import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database/types";
import { DomainError } from "@/lib/errors";
import { checkCoverage, joinWaitlist } from "@/features/locations/service";
import { createBooking, getSlotAvailability } from "@/features/bookings/service";
import { getBookingDetail, listCustomerBookings } from "@/features/bookings/queries";
import { decideEstimate } from "@/features/estimates/service";
import { listMyProperties, listPropertyRequests, getPropertyDetail } from "@/features/properties/service";
import {
  acceptInvite,
  inviteBookingApprover,
  inviteHouseholdMember,
  invitePropertyMember,
  previewInvite,
  removeHouseholdLink,
  removePropertyMember,
  revokeInvite,
} from "@/features/invitations/service";
import { actorFor, bookingPayload, categoryId, createTestDb, demoUsers, futureSlot } from "../support/db";

let db: Database;
const STUDENT_BOOKING = "10000000-0000-4000-8000-000000000211";
const LAKEVIEW = "10000000-0000-4000-8000-000000000401";
const A101_BOOKING = "10000000-0000-4000-8000-000000000206";
const A102_BOOKING = "10000000-0000-4000-8000-000000000209";
const ASHA_PLUMBING = "10000000-0000-4000-8000-000000000202";

beforeAll(async () => {
  db = await createTestDb();
});

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

describe("service coverage", () => {
  it("distinguishes served, planned, coming-soon and unknown pincodes", async () => {
    expect((await checkCoverage(db, "560034")).status).toBe("SERVED");
    expect((await checkCoverage(db, "560066")).status).toBe("AREA_NOT_LIVE"); // Whitefield is planned
    expect((await checkCoverage(db, "411045")).status).toBe("CITY_NOT_LIVE"); // Pune is coming soon
    expect((await checkCoverage(db, "110001")).status).toBe("UNKNOWN_PINCODE");
    const events = await db.query<{ n: number }>(`select count(*)::int as n from analytics_events where name = 'unavailable_area_encountered'`);
    expect(events[0].n).toBe(3);
  });

  it("only offers services enabled in the area", async () => {
    const solar = await categoryId(db, "rooftop-solar");
    const indiranagar = await checkCoverage(db, "560038");
    expect(indiranagar.categoryIds).not.toContain(solar);
    const newbie = await actorFor(db, demoUsers.newCustomer);
    const e = await expectDomainError(createBooking(db, newbie, bookingPayload(solar)), "VALIDATION");
    expect(e.message).toMatch(/isn't available in Indiranagar/);
  });

  it("refuses bookings outside live areas and lets people join the waitlist", async () => {
    const newbie = await actorFor(db, demoUsers.newCustomer);
    const electrician = await categoryId(db, "electrician");
    await expectDomainError(createBooking(db, newbie, bookingPayload(electrician, { address: { line1: "Flat 2, Demo", pincode: "560066" } })), "VALIDATION");
    await joinWaitlist(db, newbie, { pincode: "560066", categoryId: electrician });
    await joinWaitlist(db, newbie, { pincode: "560066" }); // no duplicate
    await expectDomainError(joinWaitlist(db, null, { pincode: "411045", email: "x@example.com", consent: false }), "VALIDATION");
    await joinWaitlist(db, null, { pincode: "411045", email: "x@example.com", consent: true });
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from service_waitlist`);
    expect(rows[0].n).toBe(2);
  });

  it("only offers windows where a qualified professional is available", async () => {
    const ac = await categoryId(db, "ac-service");
    const electrician = await categoryId(db, "electrician");
    const koramangala = (await checkCoverage(db, "560034")).area!.id;
    const acSlots = await getSlotAvailability(db, ac, koramangala);
    const elecSlots = await getSlotAvailability(db, electrician, koramangala);
    const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
    // Imran works Tuesday and Thursday evenings, so only those evening AC windows are open.
    for (const s of acSlots.filter((x) => x.windowKey === "18-20")) {
      expect(s.unavailableReason === null).toBe([2, 4].includes(weekday(s.date)));
    }
    // No electrician works Sundays.
    for (const s of elecSlots.filter((x) => weekday(x.date) === 0)) expect(s.unavailableReason).toBe("no_professional");
  });
});

describe("students and tenants with a landlord", () => {
  it("lets a tenant book without owning the home and records who approves", async () => {
    const newbie = await actorFor(db, demoUsers.newCustomer);
    const plumbing = await categoryId(db, "plumbing");
    const res = await createBooking(
      db,
      newbie,
      bookingPayload(plumbing, {
        date: futureSlot(2, "14-16").date,
        windowKey: "14-16",
        problemDescription: "Bathroom flush keeps running in our rented flat.",
        occupancy: "TENANT",
        costApproval: "LANDLORD",
        selfApprovalLimit: "500",
      }),
    );
    const row = (await db.query<{ occupancy: string; cost_approval: string; requester_approval_limit_paise: number }>(
      `select occupancy, cost_approval, requester_approval_limit_paise from bookings where id = $1`,
      [res.id],
    ))[0];
    expect(row).toEqual({ occupancy: "TENANT", cost_approval: "LANDLORD", requester_approval_limit_paise: 50000 });

    // Tenant invites the landlord with a single-use link.
    const invite = await inviteBookingApprover(db, newbie, res.id);
    expect(invite.token.length).toBeGreaterThan(40);
    const stored = await db.query<{ token_hash: string }>(`select token_hash from invitations where booking_id = $1`, [res.id]);
    expect(stored[0].token_hash).not.toContain(invite.token); // only the hash is stored
    expect((await previewInvite(db, invite.token))?.valid).toBe(true);

    await expectDomainError(acceptInvite(db, newbie, invite.token), "VALIDATION"); // can't accept own link
    const landlord = await actorFor(db, demoUsers.otherPm);
    expect(await getBookingDetail(db, landlord, res.id)).toBeNull(); // no access before accepting
    await acceptInvite(db, landlord, invite.token);
    const view = await getBookingDetail(db, landlord, res.id);
    expect(view?.viewer.relations).toEqual(["cost_approver"]);
    expect(view?.location?.line1).toBe("House 12, Demo Street");
    // Single use.
    const asha = await actorFor(db, demoUsers.customer);
    await expectDomainError(acceptInvite(db, asha, invite.token), "VALIDATION");
  });

  it("does not let the tenant approve above their own limit; the landlord can", async () => {
    const priya = await actorFor(db, demoUsers.student);
    const landlord = await actorFor(db, demoUsers.landlord);
    const est = (await db.query<{ id: string; total_paise: number }>(`select id, total_paise from estimates where booking_id = $1`, [STUDENT_BOOKING]))[0];
    const priyaView = await getBookingDetail(db, priya, STUDENT_BOOKING);
    expect(priyaView?.estimates[0].viewerCanApprove).toBe(false);
    expect(priyaView?.estimates[0].viewerApprovalNote).toMatch(/landlord/i);
    await expectDomainError(decideEstimate(db, priya, { estimateId: est.id, decision: "APPROVED", expectedTotalPaise: est.total_paise }), "FORBIDDEN");
    // The landlord sees this booking only — not Priya's other data.
    expect(await listCustomerBookings(db, landlord)).toEqual([]);
    await decideEstimate(db, landlord, { estimateId: est.id, decision: "APPROVED", expectedTotalPaise: est.total_paise });
    const approval = await db.query<{ payer: string; decided_by_role: string }>(`select payer, decided_by_role from estimate_approvals where estimate_id = $1`, [est.id]);
    expect(approval[0]).toEqual({ payer: "LANDLORD", decided_by_role: "LANDLORD" });
  });
});

describe("tenants of a managed property", () => {
  it("only see and request work for their own unit", async () => {
    const rohan = await actorFor(db, demoUsers.propertyTenant);
    const props = await listMyProperties(db, rohan);
    expect(props.map((p) => [p.name, p.memberRole, p.tenantUnitLabel])).toEqual([["Lakeview Residency (Demo)", "TENANT", "A-102"]]);
    expect((await listPropertyRequests(db, rohan)).map((r) => r.id)).toEqual([A102_BOOKING]);
    expect(await getBookingDetail(db, rohan, A101_BOOKING)).toBeNull();
    const detail = await getPropertyDetail(db, rohan, LAKEVIEW);
    expect(detail?.units.map((u) => u.label)).toEqual(["A-102"]);
    expect(detail?.members.every((m) => m.memberRole !== "TENANT" || m.profileId === rohan.userId)).toBe(true);
    expect(detail?.monthly.reduce((a, m) => a + m.spendPaise, 0)).toBe(0); // can't see other units' invoices

    const general = await categoryId(db, "general-maintenance");
    const a101 = "10000000-0000-4000-8000-000000000501";
    // Even if the browser sends another unit id, the server uses the tenant's own unit.
    const res = await createBooking(
      db,
      rohan,
      bookingPayload(general, { propertyId: LAKEVIEW, unitId: a101, address: undefined, date: futureSlot(3, "14-16").date, windowKey: "14-16", problemDescription: "Bedroom door hinge is broken." }),
    );
    const row = (await db.query<{ unit_id: string; occupancy: string; cost_approval: string }>(`select unit_id, occupancy, cost_approval from bookings where id = $1`, [res.id]))[0];
    expect(row).toEqual({ unit_id: "10000000-0000-4000-8000-000000000502", occupancy: "TENANT", cost_approval: "PROPERTY" });
  });

  it("owners invite tenants to a unit, and can remove them", async () => {
    const meera = await actorFor(db, demoUsers.meera);
    const karthik = await actorFor(db, demoUsers.karthik);
    await expectDomainError(invitePropertyMember(db, karthik, { propertyId: LAKEVIEW, memberRole: "TENANT", unitId: "10000000-0000-4000-8000-000000000503" }), "FORBIDDEN");
    const inv = await invitePropertyMember(db, meera, { propertyId: LAKEVIEW, memberRole: "TENANT", unitId: "10000000-0000-4000-8000-000000000503", approvalLimit: "300" });
    const newbie = await actorFor(db, demoUsers.newCustomer);
    await acceptInvite(db, newbie, inv.token);
    const props = await listMyProperties(db, newbie);
    expect(props[0]?.tenantUnitLabel).toBe("B-201");
    await removePropertyMember(db, meera, LAKEVIEW, newbie.userId);
    expect(await listMyProperties(db, newbie)).toEqual([]);
    // The last owner can't leave.
    await expectDomainError(removePropertyMember(db, meera, LAKEVIEW, meera.userId), "VALIDATION");
  });

  it("revoked links cannot be used", async () => {
    const meera = await actorFor(db, demoUsers.meera);
    const inv = await invitePropertyMember(db, meera, { propertyId: LAKEVIEW, memberRole: "VIEWER" });
    const row = (await db.query<{ id: string }>(`select id from invitations where created_by = $1 order by created_at desc limit 1`, [meera.userId]))[0];
    await revokeInvite(db, meera, row.id);
    const newbie = await actorFor(db, demoUsers.newCustomer);
    await expectDomainError(acceptInvite(db, newbie, inv.token), "VALIDATION");
    expect((await previewInvite(db, inv.token))?.valid).toBe(false);
  });
});

describe("household members", () => {
  it("can follow the owner's personal bookings and approve within their limit", async () => {
    const vikram = await actorFor(db, demoUsers.partner);
    const d = await getBookingDetail(db, vikram, ASHA_PLUMBING);
    expect(d?.access).toBe("full");
    expect(d?.viewer.relations).toContain("requester");
    // Never the owner's property data or other people's bookings.
    expect(await getBookingDetail(db, vikram, A101_BOOKING)).toBeNull();
  });

  it("invitations add and remove household access", async () => {
    const newbie = await actorFor(db, demoUsers.newCustomer);
    const asha = await actorFor(db, demoUsers.customer);
    const inv = await inviteHouseholdMember(db, asha, { access: "VIEW" });
    expect(await getBookingDetail(db, newbie, ASHA_PLUMBING)).toBeNull();
    await acceptInvite(db, newbie, inv.token);
    const view = await getBookingDetail(db, newbie, ASHA_PLUMBING);
    expect(view?.access).toBe("full");
    expect(view?.viewer.relations).toEqual([]); // VIEW access: can see, can't act
    await removeHouseholdLink(db, newbie, asha.userId, newbie.userId); // member leaves
    expect(await getBookingDetail(db, newbie, ASHA_PLUMBING)).toBeNull();
  });
});
