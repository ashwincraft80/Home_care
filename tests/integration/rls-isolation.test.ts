import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database/types";
import { getBookingDetail, listCustomerBookings, listTechnicianJobs } from "@/features/bookings/queries";
import { getPropertyDetail, listMyProperties, listPropertyRequests } from "@/features/properties/service";
import { getAssetDetail, listMyAssets, deleteMaintenanceRecord, updateAsset } from "@/features/assets/service";
import { listTechnicians, getOperationalMetrics } from "@/features/admin/service";
import { listActiveCategories } from "@/features/catalog/service";
import { DomainError } from "@/lib/errors";
import { actorFor, createTestDb, demoUsers } from "../support/db";

let db: Database;
const ASHA_BOOKING = "10000000-0000-4000-8000-000000000201";
const LAKEVIEW_BOOKING = "10000000-0000-4000-8000-000000000206";
const OFFICE_BOOKING = "10000000-0000-4000-8000-000000000207";
const HILLSIDE_BOOKING = "10000000-0000-4000-8000-000000000210";
const HILLSIDE = "10000000-0000-4000-8000-000000000403";
const ASHA_AC = "10000000-0000-4000-8000-000000000101";

beforeAll(async () => {
  db = await createTestDb();
});

/** Runs raw SQL as a user, exactly as a browser could through the Supabase API. */
const asUser = (userId: string | null, sql: string, params: unknown[] = []) => db.asUser(userId, (tx) => tx.query(sql, params));

describe("customer data isolation", () => {
  it("customers only see their own bookings, addresses and assets", async () => {
    const newbie = await actorFor(db, demoUsers.newCustomer);
    expect(await listCustomerBookings(db, newbie)).toEqual([]);
    expect(await getBookingDetail(db, newbie, ASHA_BOOKING)).toBeNull();
    expect(await listMyAssets(db, newbie)).toEqual([]);
    expect(await getAssetDetail(db, newbie, ASHA_AC)).toBeNull();
    expect(await asUser(demoUsers.newCustomer, `select * from bookings`)).toEqual([]);
    expect(await asUser(demoUsers.newCustomer, `select * from addresses`)).toEqual([]);
    expect(await asUser(demoUsers.newCustomer, `select * from invoices`)).toEqual([]);
    expect(await asUser(demoUsers.newCustomer, `select * from maintenance_records`)).toEqual([]);
    const asha = await actorFor(db, demoUsers.customer);
    expect((await listCustomerBookings(db, asha)).length).toBeGreaterThanOrEqual(5);
  });

  it("customers cannot edit or delete another customer's records (IDOR)", async () => {
    const newbie = await actorFor(db, demoUsers.newCustomer);
    await expect(updateAsset(db, newbie, ASHA_AC, { assetType: "AC", nickname: "Mine now" })).rejects.toBeInstanceOf(DomainError);
    const rec = (await db.query<{ id: string }>(`select id from maintenance_records where owner_id = $1 and source = 'SELF_REPORTED' limit 1`, [demoUsers.customer]))[0];
    await expect(deleteMaintenanceRecord(db, newbie, rec.id)).rejects.toBeInstanceOf(DomainError);
  });

  it("anonymous users can read the active catalogue but nothing personal", async () => {
    expect((await listActiveCategories(db)).length).toBe(8);
    expect(await asUser(null, `select * from service_categories where not is_active`)).toEqual([]);
    await expect(asUser(null, `select * from bookings`)).rejects.toThrow(/permission denied/);
    await expect(asUser(null, `select * from profiles`)).rejects.toThrow(/permission denied/);
  });
});

describe("no direct writes from clients", () => {
  it("authenticated users cannot insert, update or delete any table directly", async () => {
    await expect(asUser(demoUsers.customer, `update bookings set status = 'COMPLETED' where id = $1`, [ASHA_BOOKING])).rejects.toThrow(/permission denied/);
    await expect(asUser(demoUsers.customer, `insert into role_assignments (profile_id, role) values ($1, 'ADMIN')`, [demoUsers.customer])).rejects.toThrow(/permission denied/);
    await expect(asUser(demoUsers.ravi, `update technician_payouts set status = 'PAID'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(demoUsers.admin, `delete from audit_events`)).rejects.toThrow(/permission denied/);
  });

  it("the database blocks invalid status jumps even for privileged writes", async () => {
    await expect(db.query(`update bookings set status = 'COMPLETED' where id = '10000000-0000-4000-8000-000000000205'`)).rejects.toThrow(/Invalid booking status transition/);
    await expect(db.query(`update bookings set visit_fee_paise = 1 where id = $1`, [ASHA_BOOKING])).rejects.toThrow(/immutable/);
    await expect(db.query(`delete from booking_status_history`)).rejects.toThrow(/append-only/);
  });

  it("users cannot grant themselves roles by claiming them", async () => {
    // A forged claim with a role field does not matter: roles come from role_assignments.
    const rows = await db.asUser(demoUsers.customer, async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: demoUsers.customer, role: "authenticated", app_role: "ADMIN" })]);
      return tx.query(`select app.is_admin() as admin`);
    });
    expect(rows[0]).toEqual({ admin: false });
  });
});

describe("technician job-access restrictions", () => {
  it("technicians see only assigned jobs plus eligible open offers", async () => {
    const ravi = await actorFor(db, demoUsers.ravi);
    const imran = await actorFor(db, demoUsers.imran);
    const raviVisible = (await asUser(demoUsers.ravi, `select reference from bookings order by reference`)).map((r) => (r as { reference: string }).reference);
    expect(raviVisible).toContain("HC-DEMO02");
    expect(raviVisible).not.toContain("HC-DEMO01"); // Imran's job
    expect(raviVisible).not.toContain("HC-DEMO03"); // RO offer: not Ravi's skill
    expect(raviVisible).not.toContain("HC-DEMO05"); // still REQUESTED
    const imranVisible = (await asUser(demoUsers.imran, `select reference from bookings`)).map((r) => (r as { reference: string }).reference);
    expect(imranVisible).toContain("HC-DEMO03"); // eligible offer
    expect((await listTechnicianJobs(db, ravi)).every((j) => j.technicianName === "Ravi Kumar (Demo)")).toBe(true);
    expect(await getBookingDetail(db, imran, LAKEVIEW_BOOKING)).toBeNull();
  });

  it("open offers never reveal the exact address or customer contact", async () => {
    const offer = "10000000-0000-4000-8000-000000000203";
    expect(await asUser(demoUsers.imran, `select * from booking_locations where booking_id = $1`, [offer])).toEqual([]);
    expect(await asUser(demoUsers.imran, `select * from profile_contacts where profile_id = $1`, [demoUsers.customer])).toEqual([]);
  });

  it("technicians cannot see other technicians' payouts or customers' invoices", async () => {
    const payouts = (await asUser(demoUsers.imran, `select technician_id from technician_payouts`)) as { technician_id: string }[];
    expect(payouts.every((p) => p.technician_id === demoUsers.imran)).toBe(true);
    expect(await asUser(demoUsers.imran, `select * from invoices where booking_id = $1`, [OFFICE_BOOKING])).toEqual([]);
  });

  it("pending technicians see no offers", async () => {
    expect(await asUser(demoUsers.applicant, `select * from bookings`)).toEqual([]);
  });
});

describe("property-manager access restrictions", () => {
  it("managers only see properties they belong to", async () => {
    const meera = await actorFor(db, demoUsers.meera);
    const karthik = await actorFor(db, demoUsers.karthik);
    expect((await listMyProperties(db, meera)).map((p) => p.name).sort()).toEqual(["Indiranagar Office (Demo)", "Lakeview Residency (Demo)"]);
    expect((await listMyProperties(db, karthik)).map((p) => p.name)).toEqual(["Lakeview Residency (Demo)"]);
    expect(await getPropertyDetail(db, meera, HILLSIDE)).toBeNull();
    expect(await getBookingDetail(db, meera, HILLSIDE_BOOKING)).toBeNull();
    expect(await getBookingDetail(db, karthik, OFFICE_BOOKING)).toBeNull();
    expect((await listPropertyRequests(db, karthik)).every((r) => r.propertyName === "Lakeview Residency (Demo)")).toBe(true);
    expect(await asUser(demoUsers.meera, `select * from properties where id = $1`, [HILLSIDE])).toEqual([]);
  });

  it("managers can view their property's job details", async () => {
    const karthik = await actorFor(db, demoUsers.karthik);
    const d = await getBookingDetail(db, karthik, LAKEVIEW_BOOKING);
    expect(d?.access).toBe("full");
    expect(d?.property?.unitLabel).toBe("A-101");
  });
});

describe("admin-only data", () => {
  it("non-admins cannot read audit or analytics events or the technician directory", async () => {
    expect(await asUser(demoUsers.customer, `select * from audit_events`)).toEqual([]);
    expect(await asUser(demoUsers.meera, `select * from analytics_events`)).toEqual([]);
    const asha = await actorFor(db, demoUsers.customer);
    await expect(listTechnicians(db, asha)).rejects.toBeInstanceOf(DomainError);
    await expect(getOperationalMetrics(db, asha)).rejects.toBeInstanceOf(DomainError);
  });

  it("metrics use real data and report insufficient samples honestly", async () => {
    const admin = await actorFor(db, demoUsers.admin);
    const { metrics } = await getOperationalMetrics(db, admin);
    const conversion = metrics.find((m) => m.key === "conversion")!;
    expect(conversion.denominator).toBe(0);
    expect(conversion.value).toBeNull();
    expect(conversion.sufficient).toBe(false);
    const cancellation = metrics.find((m) => m.key === "cancellation")!;
    expect(cancellation.sufficient).toBe(true);
    expect(cancellation.value).toBe(0);
  });
});
