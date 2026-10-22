import { site } from "@/lib/config/site";
import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { canManageProperty, hasRole } from "@/lib/permissions";
import { coverageFor } from "@/features/locations/service";
import { parseOrThrow, propertyInputSchema, unitInputSchema } from "@/lib/validation";
import { membershipOf } from "@/features/bookings/service";
import type { Actor, MemberRole } from "@/types/domain";
import { z } from "zod";

export interface PropertySummary {
  id: string;
  name: string;
  propertyType: string;
  line1: string;
  locality: string;
  city: string;
  pincode: string;
  memberRole: MemberRole;
  tenantUnitLabel: string | null;
  serviceAreaId: string | null;
  unitCount: number;
  openRequests: number;
  awaitingApproval: number;
}

export async function listMyProperties(db: Database, actor: Actor): Promise<PropertySummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<PropertySummary>(
      `select p.id, p.name, p.property_type as "propertyType", p.line1, p.locality, p.city, p.pincode, m.member_role as "memberRole",
              (select label from property_units where id = m.unit_id) as "tenantUnitLabel", p.service_area_id as "serviceAreaId",
              (select count(*)::int from property_units u where u.property_id = p.id) as "unitCount",
              (select count(*)::int from bookings b where b.property_id = p.id and b.status not in ('COMPLETED','CANCELLED','DECLINED')) as "openRequests",
              (select count(*)::int from bookings b where b.property_id = p.id and b.status in ('AWAITING_APPROVAL','COMPLETION_PENDING')) as "awaitingApproval"
       from properties p join property_memberships m on m.property_id = p.id and m.profile_id = $1
       where p.archived_at is null order by p.name`,
      [actor.userId],
    ),
  );
}

export interface MonthlySummaryRow {
  month: string;
  requests: number;
  completed: number;
  spendPaise: number;
}

export async function getPropertyDetail(db: Database, actor: Actor, propertyId: string) {
  if (!z.uuid().safeParse(propertyId).success) return null;
  return db.asUser(actor.userId, async (tx) => {
    const property = await one<Omit<PropertySummary, "memberRole" | "tenantUnitLabel" | "unitCount" | "openRequests" | "awaitingApproval">>(
      tx,
      `select id, name, property_type as "propertyType", line1, locality, city, pincode, service_area_id as "serviceAreaId"
       from properties where id = $1 and archived_at is null`,
      [propertyId],
    );
    if (!property) return null;
    const membership = await one<{ memberRole: MemberRole; unitId: string | null; approvalLimitPaise: number | null }>(
      tx,
      `select member_role as "memberRole", unit_id as "unitId", approval_limit_paise as "approvalLimitPaise" from property_memberships where property_id = $1 and profile_id = $2`,
      [propertyId, actor.userId],
    );
    const units = await tx.query<{ id: string; label: string; notes: string | null; openRequests: number }>(
      `select u.id, u.label, u.notes,
              (select count(*)::int from bookings b where b.unit_id = u.id and b.status not in ('COMPLETED','CANCELLED','DECLINED')) as "openRequests"
       from property_units u where u.property_id = $1 order by u.label`,
      [propertyId],
    );
    const members = await tx.query<{ profileId: string; name: string; memberRole: MemberRole; unitLabel: string | null; approvalLimitPaise: number | null }>(
      `select m.profile_id as "profileId", p.full_name as name, m.member_role as "memberRole", u.label as "unitLabel",
              m.approval_limit_paise as "approvalLimitPaise"
       from property_memberships m join profiles p on p.id = m.profile_id left join property_units u on u.id = m.unit_id
       where m.property_id = $1 order by m.member_role, p.full_name`,
      [propertyId],
    );
    const monthly = await tx.query<MonthlySummaryRow>(
      `with months as (
         select to_char(date_trunc('month', (now() at time zone $2) - (n || ' month')::interval), 'YYYY-MM') as month
         from generate_series(0, 5) as n
       )
       select m.month,
              (select count(*)::int from bookings b where b.property_id = $1 and to_char(b.created_at at time zone $2, 'YYYY-MM') = m.month) as requests,
              (select count(*)::int from bookings b where b.property_id = $1 and b.status = 'COMPLETED' and to_char(b.completed_at at time zone $2, 'YYYY-MM') = m.month) as completed,
              (select coalesce(sum(i.total_paise), 0)::int from invoices i where i.property_id = $1 and to_char(i.issued_at at time zone $2, 'YYYY-MM') = m.month) as "spendPaise"
       from months m order by m.month desc`,
      [propertyId, site.locale.timeZone],
    );
    const invites =
      membership?.memberRole === "OWNER"
        ? await tx.query<{ id: string; memberRole: string; unitLabel: string | null; expiresAt: Date; status: string }>(
            `select i.id, i.member_role as "memberRole", u.label as "unitLabel", i.expires_at as "expiresAt", i.status
             from invitations i left join property_units u on u.id = i.unit_id
             where i.property_id = $1 and i.status = 'PENDING' and i.expires_at > now() order by i.created_at desc`,
            [propertyId],
          )
        : [];
    return { property, membership, units, members, monthly, invites };
  });
}

export async function createProperty(db: Database, actor: Actor, rawInput: unknown): Promise<{ id: string }> {
  if (!hasRole(actor, "PROPERTY_MANAGER")) throw forbidden("Property manager access is required.");
  const input = parseOrThrow(propertyInputSchema, rawInput);
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const cov = await coverageFor(tx, input.pincode);
      const row = await one<{ id: string }>(
        tx,
        `insert into properties (name, property_type, line1, locality, city, pincode, service_area_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [input.name, input.propertyType, input.line1, cov.area?.name ?? "Outside our service areas", cov.city?.name ?? "—", input.pincode, cov.area?.id ?? null, actor.userId],
      );
      await tx.query(
        `insert into property_memberships (property_id, profile_id, member_role, approval_limit_paise) values ($1, $2, 'OWNER', null)`,
        [row!.id, actor.userId],
      );
      await recordAudit(tx, actor, "property.created", "property", row!.id, { name: input.name });
      return { id: row!.id };
    }),
  );
}

export async function updateProperty(db: Database, actor: Actor, propertyId: string, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(propertyInputSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const m = await membershipOf(tx, propertyId, actor.userId);
      if (!canManageProperty(m)) throw m ? forbidden("Viewers can't edit property details.") : notFound("Property not found.");
      const cov = await coverageFor(tx, input.pincode);
      await tx.query(
        `update properties set name = $2, property_type = $3, line1 = $4, locality = $5, city = $6, pincode = $7, service_area_id = $8 where id = $1`,
        [propertyId, input.name, input.propertyType, input.line1, cov.area?.name ?? "Outside our service areas", cov.city?.name ?? "—", input.pincode, cov.area?.id ?? null],
      );
      await recordAudit(tx, actor, "property.updated", "property", propertyId);
    }),
  );
}

export async function addUnit(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(unitInputSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const m = await membershipOf(tx, input.propertyId, actor.userId);
      if (!canManageProperty(m)) throw m ? forbidden() : notFound("Property not found.");
      await tx.query(`insert into property_units (property_id, label, notes) values ($1, $2, $3)`, [input.propertyId, input.label, input.notes ?? null]);
      await recordAudit(tx, actor, "property.unit_added", "property", input.propertyId, { label: input.label });
    }),
  );
}

export async function removeUnit(db: Database, actor: Actor, unitId: string): Promise<void> {
  if (!z.uuid().safeParse(unitId).success) throw notFound();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const u = await one<{ property_id: string; used: boolean }>(
        tx,
        `select property_id, exists (select 1 from bookings where unit_id = $1) as used from property_units where id = $1`,
        [unitId],
      );
      if (!u) throw notFound("Unit not found.");
      const m = await membershipOf(tx, u.property_id, actor.userId);
      if (!canManageProperty(m)) throw m ? forbidden() : notFound("Unit not found.");
      if (u.used) throw new DomainError("VALIDATION", "This unit has service history and can't be removed.");
      await tx.query(`delete from property_units where id = $1`, [unitId]);
      await recordAudit(tx, actor, "property.unit_removed", "property", u.property_id);
    }),
  );
}

export interface PropertyRequestRow {
  id: string;
  reference: string;
  status: string;
  categoryName: string;
  categoryIcon: string;
  propertyId: string;
  propertyName: string;
  unitLabel: string | null;
  slotStart: Date;
  slotEnd: Date;
  createdAt: Date;
}

export async function listPropertyRequests(db: Database, actor: Actor, opts: { propertyId?: string; open?: boolean } = {}) {
  return db.asUser(actor.userId, (tx) =>
    tx.query<PropertyRequestRow>(
      `select b.id, b.reference, b.status, c.name as "categoryName", c.icon as "categoryIcon", b.property_id as "propertyId",
              p.name as "propertyName", u.label as "unitLabel", b.slot_start as "slotStart", b.slot_end as "slotEnd", b.created_at as "createdAt"
       from bookings b join service_categories c on c.id = b.category_id join properties p on p.id = b.property_id
       left join property_units u on u.id = b.unit_id
       join property_memberships m on m.property_id = b.property_id and m.profile_id = $1
       where ($2::uuid is null or b.property_id = $2)
         and (m.member_role <> 'TENANT' or b.unit_id = m.unit_id)
         and (not $3 or b.status not in ('COMPLETED','CANCELLED','DECLINED'))
       order by case when b.status in ('AWAITING_APPROVAL','COMPLETION_PENDING') then 0 else 1 end, b.slot_start desc
       limit 200`,
      [actor.userId, opts.propertyId ?? null, Boolean(opts.open)],
    ),
  );
}

export async function listPropertyInvoices(db: Database, actor: Actor) {
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; number: string; bookingId: string; bookingReference: string; propertyName: string; totalPaise: number; paymentStatus: string; issuedAt: Date; categoryName: string }>(
      `select i.id, i.number, i.booking_id as "bookingId", b.reference as "bookingReference", p.name as "propertyName",
              i.total_paise as "totalPaise", i.payment_status as "paymentStatus", i.issued_at as "issuedAt", c.name as "categoryName"
       from invoices i join bookings b on b.id = i.booking_id join properties p on p.id = i.property_id
       join service_categories c on c.id = b.category_id
       join property_memberships m on m.property_id = i.property_id and m.profile_id = $1
       where m.member_role <> 'TENANT' or b.unit_id = m.unit_id
       order by i.issued_at desc`,
      [actor.userId],
    ),
  );
}
