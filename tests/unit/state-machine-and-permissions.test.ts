import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canTransition, isTransitionDefined, nextStatusesFor, transitions } from "@/features/bookings/state-machine";
import {
  approvalAuthority,
  canApproveEstimate,
  canRequestForProperty,
  canEditAsset,
  canRejectEstimate,
  canSubmitEstimate,
  canViewBookingDetails,
  cancellationFeeFor,
  relationsTo,
} from "@/lib/permissions";
import { cancellationPolicy } from "@/lib/config/site";
import { bookingStatuses, type Actor, type BookingAccessFacts, type BookingStatus } from "@/types/domain";

const customer: Actor = { userId: "c1", name: "C", roles: ["CUSTOMER"], technicianStatus: null };
const otherCustomer: Actor = { userId: "c2", name: "C2", roles: ["CUSTOMER"], technicianStatus: null };
const tech: Actor = { userId: "t1", name: "T", roles: ["CUSTOMER", "TECHNICIAN"], technicianStatus: "APPROVED" };
const suspendedTech: Actor = { ...tech, userId: "t2", technicianStatus: "SUSPENDED" };
const admin: Actor = { userId: "a1", name: "A", roles: ["CUSTOMER", "ADMIN"], technicianStatus: null };
const pm: Actor = { userId: "p1", name: "P", roles: ["CUSTOMER", "PROPERTY_MANAGER"], technicianStatus: null };

const booking = (status: BookingStatus, extra: Partial<BookingAccessFacts> = {}): BookingAccessFacts => ({
  id: "b1",
  customerId: "c1",
  technicianId: "t1",
  propertyId: null,
  status,
  ...extra,
});

describe("booking state machine", () => {
  it("follows the happy path", () => {
    expect(canTransition("REQUESTED", "CONFIRMED", ["admin"])).toBe(true);
    expect(canTransition("CONFIRMED", "ASSIGNED", ["eligible_technician"])).toBe(true);
    expect(canTransition("ASSIGNED", "EN_ROUTE", ["assigned_technician"])).toBe(true);
    expect(canTransition("EN_ROUTE", "IN_PROGRESS", ["assigned_technician"])).toBe(true);
    expect(canTransition("IN_PROGRESS", "AWAITING_APPROVAL", ["assigned_technician"])).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "IN_PROGRESS", ["requester"])).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETION_PENDING", ["assigned_technician"])).toBe(true);
    expect(canTransition("COMPLETION_PENDING", "COMPLETED", ["requester"])).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("REQUESTED", "COMPLETED", ["admin"])).toBe(false);
    expect(canTransition("IN_PROGRESS", "COMPLETED", ["assigned_technician"])).toBe(false); // technician cannot self-complete
    expect(canTransition("COMPLETION_PENDING", "COMPLETED", ["assigned_technician"])).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED", ["admin"])).toBe(false);
    expect(canTransition("COMPLETED", "IN_PROGRESS", ["admin"])).toBe(false);
    expect(canTransition("ASSIGNED", "EN_ROUTE", ["requester"])).toBe(false);
    expect(canTransition("CONFIRMED", "ASSIGNED", ["requester"])).toBe(false);
  });

  it("has no outgoing transitions from terminal states", () => {
    for (const s of ["COMPLETED", "CANCELLED", "DECLINED"] as BookingStatus[]) {
      expect(nextStatusesFor(s, ["admin", "requester", "assigned_technician"])).toEqual([]);
    }
  });

  it("matches the database transition function exactly", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261022000001_core_schema.sql"), "utf8");
    const fn = sql.slice(sql.indexOf("app.booking_transition_allowed"), sql.indexOf("create or replace function app.enforce_booking_transition"));
    const pairs = new Set([...fn.matchAll(/\('([A-Z_]+)','([A-Z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`));
    const tsPairs = new Set<string>();
    for (const from of bookingStatuses) for (const to of bookingStatuses) if (isTransitionDefined(from, to)) tsPairs.add(`${from}>${to}`);
    expect([...tsPairs].sort()).toEqual([...pairs].sort());
    expect(Object.keys(transitions).length).toBe(bookingStatuses.length);
  });
});

describe("relations and booking access", () => {
  it("derives relations from facts, not claimed roles", () => {
    expect(relationsTo(customer, booking("ASSIGNED"))).toEqual(["requester"]);
    expect(relationsTo(otherCustomer, booking("ASSIGNED"))).toEqual([]);
    expect(relationsTo(tech, booking("ASSIGNED"))).toEqual(["assigned_technician"]);
    expect(relationsTo(suspendedTech, booking("ASSIGNED", { technicianId: "t2" }))).toEqual([]);
    expect(relationsTo(admin, booking("ASSIGNED"))).toEqual(["admin"]);
  });

  it("isolates customer bookings", () => {
    expect(canViewBookingDetails(customer, booking("REQUESTED"))).toBe(true);
    expect(canViewBookingDetails(otherCustomer, booking("REQUESTED"))).toBe(false);
  });

  it("only gives eligible technicians offer access to unassigned jobs", () => {
    const open = booking("CONFIRMED", { technicianId: null });
    const other: Actor = { ...tech, userId: "t9" };
    expect(relationsTo(other, open, { isEligibleOffer: true })).toEqual(["eligible_technician"]);
    expect(relationsTo(other, open, { isEligibleOffer: false })).toEqual([]);
    expect(canViewBookingDetails(other, open)).toBe(false);
    expect(canSubmitEstimate(other, booking("IN_PROGRESS"))).toBe(false);
    expect(canSubmitEstimate(tech, booking("IN_PROGRESS"))).toBe(true);
    expect(canSubmitEstimate(tech, booking("ASSIGNED"))).toBe(false);
  });

  it("restricts property managers to their property and approval limits", () => {
    const pb = booking("AWAITING_APPROVAL", { customerId: "owner", propertyId: "prop1", unitId: "u1", costApproval: "PROPERTY" });
    const manager = { propertyId: "prop1", memberRole: "MANAGER" as const, unitId: null, approvalLimitPaise: 200000 };
    const viewer = { propertyId: "prop1", memberRole: "VIEWER" as const, unitId: null, approvalLimitPaise: null };
    const elsewhere = { propertyId: "prop2", memberRole: "OWNER" as const, unitId: null, approvalLimitPaise: null };
    expect(canApproveEstimate(pm, pb, 150000, { membership: manager })).toBe(true);
    expect(canApproveEstimate(pm, pb, 250000, { membership: manager })).toBe(false);
    expect(canRejectEstimate(pm, pb, { membership: manager })).toBe(true);
    expect(canApproveEstimate(pm, pb, 1000, { membership: viewer })).toBe(false);
    expect(canRejectEstimate(pm, pb, { membership: viewer })).toBe(false);
    expect(canViewBookingDetails(pm, pb, { membership: viewer })).toBe(true);
    expect(canApproveEstimate(pm, pb, 1000, { membership: elsewhere })).toBe(false);
    expect(canViewBookingDetails(pm, pb, { membership: elsewhere })).toBe(false);
    expect(canApproveEstimate(customer, booking("AWAITING_APPROVAL"), 99999999)).toBe(true);
    expect(canApproveEstimate(otherCustomer, booking("AWAITING_APPROVAL"), 1)).toBe(false);
  });

  it("scopes property tenants to their own unit and limit", () => {
    const tenant = { propertyId: "prop1", memberRole: "TENANT" as const, unitId: "u2", approvalLimitPaise: 50000 };
    const ownUnit = booking("AWAITING_APPROVAL", { customerId: "tenant", propertyId: "prop1", unitId: "u2", costApproval: "PROPERTY" });
    const otherUnit = booking("AWAITING_APPROVAL", { customerId: "owner", propertyId: "prop1", unitId: "u1", costApproval: "PROPERTY" });
    const rohan: Actor = { userId: "tenant", name: "R", roles: ["CUSTOMER"], technicianStatus: null };
    expect(canViewBookingDetails(rohan, otherUnit, { membership: tenant })).toBe(false);
    expect(approvalAuthority(rohan, ownUnit, 40000, { membership: tenant })).toMatchObject({ allowed: true, payer: "REQUESTER" });
    expect(approvalAuthority(rohan, ownUnit, 60000, { membership: tenant }).allowed).toBe(false);
    expect(canRequestForProperty(tenant, "u2")).toBe(true);
    expect(canRequestForProperty(tenant, "u1")).toBe(false);
  });

  it("routes rented-home approvals to the landlord above the tenant's own limit", () => {
    const rented = booking("AWAITING_APPROVAL", { costApproval: "LANDLORD", requesterApprovalLimitPaise: 30000 });
    const landlord: Actor = { userId: "l1", name: "L", roles: ["CUSTOMER"], technicianStatus: null };
    expect(approvalAuthority(customer, rented, 25000)).toMatchObject({ allowed: true, payer: "REQUESTER" });
    expect(approvalAuthority(customer, rented, 184900)).toMatchObject({ allowed: false });
    expect(approvalAuthority(landlord, rented, 184900, { approver: { approvalLimitPaise: null } })).toMatchObject({ allowed: true, payer: "LANDLORD" });
    expect(approvalAuthority(landlord, rented, 184900)).toMatchObject({ allowed: false });
    // The landlord can decide on the estimate but cannot cancel the tenant's booking.
    expect(relationsTo(landlord, rented, { approver: { approvalLimitPaise: null } })).toEqual(["cost_approver"]);
  });

  it("lets household members follow, and MANAGE members approve within their limit", () => {
    const partner: Actor = { userId: "h1", name: "H", roles: ["CUSTOMER"], technicianStatus: null };
    const b = booking("AWAITING_APPROVAL");
    expect(canViewBookingDetails(partner, b, { household: { access: "VIEW", approvalLimitPaise: null } })).toBe(true);
    expect(approvalAuthority(partner, b, 1000, { household: { access: "VIEW", approvalLimitPaise: null } }).allowed).toBe(false);
    expect(approvalAuthority(partner, b, 250000, { household: { access: "MANAGE", approvalLimitPaise: 300000 } })).toMatchObject({ allowed: true, payer: "HOUSEHOLD" });
    expect(approvalAuthority(partner, b, 350000, { household: { access: "MANAGE", approvalLimitPaise: 300000 } }).allowed).toBe(false);
    // Household access never extends to property bookings.
    const pb = booking("AWAITING_APPROVAL", { propertyId: "prop1", costApproval: "PROPERTY" });
    expect(canViewBookingDetails(partner, pb, { household: { access: "MANAGE", approvalLimitPaise: 300000 } })).toBe(false);
  });

  it("limits asset edits to owners and property managers", () => {
    expect(canEditAsset(customer, { ownerId: "c1", propertyId: null })).toBe(true);
    expect(canEditAsset(otherCustomer, { ownerId: "c1", propertyId: null })).toBe(false);
    expect(canEditAsset(pm, { ownerId: null, propertyId: "prop1" }, { propertyId: "prop1", memberRole: "MANAGER", unitId: null, approvalLimitPaise: 0 })).toBe(true);
    expect(canEditAsset(pm, { ownerId: null, propertyId: "prop1" }, { propertyId: "prop1", memberRole: "VIEWER", unitId: null, approvalLimitPaise: null })).toBe(false);
  });
});

describe("cancellation fee", () => {
  const now = new Date("2026-10-22T06:00:00Z");
  it("is free well before the window and before confirmation", () => {
    expect(cancellationFeeFor({ status: "CONFIRMED", slotStart: new Date("2026-10-22T10:00:00Z") }, now)).toBe(0);
    expect(cancellationFeeFor({ status: "REQUESTED", slotStart: new Date("2026-10-22T06:30:00Z") }, now)).toBe(0);
  });
  it("applies inside the cut-off or once the professional is on the way", () => {
    expect(cancellationFeeFor({ status: "ASSIGNED", slotStart: new Date("2026-10-22T07:00:00Z") }, now)).toBe(cancellationPolicy.lateCancellationFeePaise);
    expect(cancellationFeeFor({ status: "EN_ROUTE", slotStart: new Date("2026-10-23T07:00:00Z") }, now)).toBe(cancellationPolicy.lateCancellationFeePaise);
  });
});
