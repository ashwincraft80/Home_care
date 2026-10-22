import { appointmentWindows, cancellationPolicy, schedulingPolicy } from "@/lib/config/site";
import type { Database, Queryable } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, conflict, forbidden, notFound } from "@/lib/errors";
import { bookingReference, newId } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import {
  canChangeStatus,
  canRequestForProperty,
  cancellationFeeFor,
  hasRole,
  isApprovedTechnician,
  relationsTo,
  type BookingContext,
  type MembershipFacts,
} from "@/lib/permissions";
import { bookingInputSchema, parseOrThrow } from "@/lib/validation";
import { localDateKey as localDateOf, resolveSlot, upcomingSlots, type SlotOption } from "@/lib/time";
import { rupeesToPaise } from "@/lib/money";
import { coverageFor } from "@/features/locations/service";
import { adminIds, notify, propertyManagerIds } from "@/features/notifications/service";
import type { BookingRelation } from "./state-machine";
import type { Actor, BookingAccessFacts, BookingStatus, CostApproval } from "@/types/domain";
import { z } from "zod";

export interface BookingFacts extends BookingAccessFacts {
  reference: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  slotStart: Date;
  slotEnd: Date;
  windowKey: string;
  locality: string;
  visitFeePaise: number;
  assetId: string | null;
  unitId: string | null;
  requestedSlotStart: Date | null;
  requestedSlotEnd: Date | null;
  requestedWindowKey: string | null;
  serviceAreaId: string;
  costApproval: CostApproval;
  requesterApprovalLimitPaise: number | null;
}

const FACTS_SQL = `
  select b.id, b.reference, b.customer_id as "customerId", b.technician_id as "technicianId",
         b.property_id as "propertyId", b.unit_id as "unitId", b.status, b.category_id as "categoryId",
         c.name as "categoryName", c.slug as "categorySlug",
         b.slot_start as "slotStart", b.slot_end as "slotEnd", b.window_key as "windowKey", b.locality,
         b.visit_fee_paise as "visitFeePaise", b.asset_id as "assetId",
         b.requested_slot_start as "requestedSlotStart", b.requested_slot_end as "requestedSlotEnd",
         b.requested_window_key as "requestedWindowKey", b.service_area_id as "serviceAreaId",
         b.cost_approval as "costApproval", b.requester_approval_limit_paise as "requesterApprovalLimitPaise"
  from bookings b join service_categories c on c.id = b.category_id
  where b.id = $1`;

export async function lockBooking(tx: Queryable, bookingId: string): Promise<BookingFacts> {
  if (!z.uuid().safeParse(bookingId).success) throw notFound("Booking not found.");
  const row = await one<BookingFacts>(tx, `${FACTS_SQL} for update of b`, [bookingId]);
  if (!row) throw notFound("Booking not found.");
  return row;
}

export async function membershipOf(tx: Queryable, propertyId: string | null, userId: string): Promise<MembershipFacts | null> {
  if (!propertyId) return null;
  return one<MembershipFacts>(
    tx,
    `select property_id as "propertyId", member_role as "memberRole", unit_id as "unitId", approval_limit_paise as "approvalLimitPaise"
     from property_memberships where property_id = $1 and profile_id = $2`,
    [propertyId, userId],
  );
}

/** Everything that determines how `userId` relates to a booking, loaded from the database. */
export async function bookingContextFor(tx: Queryable, b: BookingFacts, userId: string): Promise<BookingContext> {
  const membership = await membershipOf(tx, b.propertyId, userId);
  const approver = await one<{ approvalLimitPaise: number | null }>(
    tx,
    `select approval_limit_paise as "approvalLimitPaise" from booking_approvers where booking_id = $1 and profile_id = $2`,
    [b.id, userId],
  );
  const household = b.propertyId
    ? null
    : await one<{ access: "VIEW" | "MANAGE"; approvalLimitPaise: number | null }>(
        tx,
        `select access, approval_limit_paise as "approvalLimitPaise" from household_members where owner_id = $1 and member_id = $2`,
        [b.customerId, userId],
      );
  return { membership, approver, household };
}

export async function isEligibleOffer(tx: Queryable, bookingId: string, technicianId: string): Promise<boolean> {
  const row = await one<{ ok: boolean }>(
    tx,
    `select exists (
       select 1 from bookings b
       join technician_profiles tp on tp.profile_id = $2 and tp.verification_status = 'APPROVED'
       join technician_capabilities tc on tc.technician_id = tp.profile_id and tc.category_id = b.category_id
       join technician_service_areas ta on ta.technician_id = tp.profile_id and ta.service_area_id = b.service_area_id
       where b.id = $1 and b.status = 'CONFIRMED' and b.technician_id is null and b.slot_start > now()
         and not exists (select 1 from booking_offer_declines d where d.booking_id = b.id and d.technician_id = tp.profile_id)
     ) as ok`,
    [bookingId, technicianId],
  );
  return Boolean(row?.ok);
}

const UPDATABLE_COLUMNS = new Set([
  "technician_id",
  "assigned_at",
  "confirmed_at",
  "completed_at",
  "cancellation_reason",
  "cancellation_fee_paise",
  "cancelled_by",
  "slot_start",
  "slot_end",
  "window_key",
  "requested_slot_start",
  "requested_slot_end",
  "requested_window_key",
]);

/**
 * Applies a status change (or same-status field change) with optimistic concurrency, writes the
 * status history entry and the audit event. Callers must have authorised the change already.
 */
export async function moveStatus(
  tx: Queryable,
  booking: BookingFacts,
  to: BookingStatus,
  actor: Actor | null,
  roleLabel: string,
  note: string | null,
  fields: Record<string, unknown> = {},
): Promise<void> {
  const cols = Object.keys(fields);
  for (const c of cols) if (!UPDATABLE_COLUMNS.has(c)) throw new Error(`Column ${c} is not updatable here`);
  const sets = ["status = $3", ...cols.map((c, i) => `${c} = $${i + 4}`)];
  const rows = await tx.query(
    `update bookings set ${sets.join(", ")} where id = $1 and status = $2 returning id`,
    [booking.id, booking.status, to, ...cols.map((c) => fields[c])],
  );
  if (rows.length === 0) throw conflict("This booking was just updated by someone else. Please refresh and try again.");
  await tx.query(
    `insert into booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, note)
     values ($1, $2, $3, $4, $5, $6)`,
    [booking.id, booking.status, to, actor?.userId ?? null, roleLabel, note],
  );
  await recordAudit(
    tx,
    actor,
    booking.status === to ? "booking.updated" : "booking.status_changed",
    "booking",
    booking.id,
    { from: booking.status, to, note, fields: cols },
    roleLabel,
  );
}

function primaryRelationLabel(relations: BookingRelation[], preferred?: BookingRelation): string {
  if (preferred && relations.includes(preferred)) return preferred.toUpperCase();
  return (relations[0] ?? "system").toUpperCase();
}

/** Everyone who should hear about progress: requester, property managers, landlord approvers, household. */
export async function requesterIds(tx: Queryable, b: BookingFacts): Promise<string[]> {
  const extra = await tx.query<{ id: string }>(
    `select profile_id as id from booking_approvers where booking_id = $1
     union select member_id as id from household_members where owner_id = $2 and $3::uuid is null`,
    [b.id, b.customerId, b.propertyId],
  );
  return [b.customerId, ...(await propertyManagerIds(tx, b.propertyId)), ...extra.map((r) => r.id)];
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface SlotAvailability {
  date: string;
  windowKey: string;
  start: Date;
  end: Date;
  remaining: number;
  /** Why a window can't be booked, for honest messaging. */
  unavailableReason: "full" | "no_professional" | null;
}

const ACTIVE_FOR_CAPACITY = `('CANCELLED','DECLINED')`;

/** Weekday (0 = Sunday) of a local calendar date. */
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * Bookable capacity for one window: limited by operations capacity AND by approved technicians who
 * do this service in this area and have marked themselves available for that weekday and window.
 */
async function windowCapacity(tx: Queryable, categoryId: string, serviceAreaId: string, slot: SlotOption) {
  const techs = await one<{ n: number }>(
    tx,
    `select count(*)::int as n from technician_profiles tp
     join technician_capabilities tc on tc.technician_id = tp.profile_id and tc.category_id = $1
     join technician_service_areas ta on ta.technician_id = tp.profile_id and ta.service_area_id = $2
     join availability_slots av on av.technician_id = tp.profile_id and av.weekday = $3 and av.window_key = $4
     where tp.verification_status = 'APPROVED'`,
    [categoryId, serviceAreaId, weekdayOf(slot.date), slot.windowKey],
  );
  const booked = await one<{ n: number }>(
    tx,
    `select count(*)::int as n from bookings where category_id = $1 and service_area_id = $2 and slot_start = $3 and status not in ${ACTIVE_FOR_CAPACITY}`,
    [categoryId, serviceAreaId, slot.start],
  );
  const technicians = techs?.n ?? 0;
  const capacity = Math.min(schedulingPolicy.capacityPerCategoryPerWindow, technicians);
  return { technicians, booked: booked?.n ?? 0, remaining: Math.max(0, capacity - (booked?.n ?? 0)) };
}

/** Remaining capacity per window for a service in an area. Aggregate counts only — never other customers' data. */
export async function getSlotAvailability(
  db: Database,
  categoryId: string,
  serviceAreaId: string,
  now: Date = new Date(),
): Promise<SlotAvailability[]> {
  if (!z.uuid().safeParse(categoryId).success || !z.uuid().safeParse(serviceAreaId).success) return [];
  const slots = upcomingSlots(now);
  const techRows = await db.query<{ weekday: number; window_key: string; n: number }>(
    `select av.weekday, av.window_key, count(distinct tp.profile_id)::int as n
     from technician_profiles tp
     join technician_capabilities tc on tc.technician_id = tp.profile_id and tc.category_id = $1
     join technician_service_areas ta on ta.technician_id = tp.profile_id and ta.service_area_id = $2
     join availability_slots av on av.technician_id = tp.profile_id
     where tp.verification_status = 'APPROVED'
     group by av.weekday, av.window_key`,
    [categoryId, serviceAreaId],
  );
  const bookedRows = await db.query<{ slot_start: Date; n: number }>(
    `select slot_start, count(*)::int as n from bookings
     where category_id = $1 and service_area_id = $2 and slot_start >= $3 and status not in ${ACTIVE_FOR_CAPACITY}
     group by slot_start`,
    [categoryId, serviceAreaId, now],
  );
  const techMap = new Map(techRows.map((r) => [`${r.weekday}:${r.window_key}`, r.n]));
  const booked = new Map(bookedRows.map((r) => [new Date(r.slot_start).getTime(), r.n]));
  return slots.map((s) => {
    const technicians = techMap.get(`${weekdayOf(s.date)}:${s.windowKey}`) ?? 0;
    const capacity = Math.min(schedulingPolicy.capacityPerCategoryPerWindow, technicians);
    const remaining = Math.max(0, capacity - (booked.get(s.start.getTime()) ?? 0));
    return {
      ...s,
      remaining,
      unavailableReason: technicians === 0 ? "no_professional" : remaining === 0 ? "full" : null,
    };
  });
}

export { appointmentWindows };

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateBookingResult {
  id: string;
  reference: string;
  duplicate: boolean;
}

export async function createBooking(
  db: Database,
  actor: Actor,
  rawInput: unknown,
  opts: { now?: Date; anonymousId?: string | null } = {},
): Promise<CreateBookingResult> {
  const input = parseOrThrow(bookingInputSchema, rawInput);
  const now = opts.now ?? new Date();
  const slot = resolveSlot(input.date, input.windowKey);
  if (!slot) throw new DomainError("VALIDATION", "Choose a valid time window.", { windowKey: ["Choose a valid time window"] });
  const earliest = now.getTime() + schedulingPolicy.minLeadMinutes * 60000;
  const latest = now.getTime() + (schedulingPolicy.bookingHorizonDays + 1) * 86400000;
  if (slot.start.getTime() < earliest || slot.start.getTime() > latest) {
    throw new DomainError("VALIDATION", "That time window is no longer available. Please choose another.", {
      windowKey: ["Choose another window"],
    });
  }

  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const existing = await one<{ id: string; reference: string }>(
        tx,
        `select id, reference from bookings where customer_id = $1 and idempotency_key = $2`,
        [actor.userId, input.idempotencyKey],
      );
      if (existing) return { ...existing, duplicate: true };

      const category = await one<{
        id: string;
        slug: string;
        name: string;
        visit_fee_paise: number;
        indicative_min_paise: number | null;
        indicative_max_paise: number | null;
      }>(
        tx,
        `select id, slug, name, visit_fee_paise, indicative_min_paise, indicative_max_paise
         from service_categories where id = $1 and is_active`,
        [input.categoryId],
      );
      if (!category) throw new DomainError("VALIDATION", "This service is not available right now.", { categoryId: ["Not available"] });

      let location: { line1: string; landmark: string | null; pincode: string };
      let propertyId: string | null = null;
      let unitId: string | null = null;
      let occupancy: "OWNER" | "TENANT" | "MANAGER" = input.occupancy;
      let costApproval: CostApproval = input.costApproval;
      let selfLimit: number | null = null;

      if (input.propertyId) {
        const membership = await membershipOf(tx, input.propertyId, actor.userId);
        const requestedUnit = membership?.memberRole === "TENANT" ? membership.unitId : (input.unitId ?? null);
        if (!canRequestForProperty(membership, requestedUnit)) throw forbidden("You can't raise requests for this property.");
        const p = await one<{ line1: string; pincode: string }>(
          tx,
          `select line1, pincode from properties where id = $1 and archived_at is null`,
          [input.propertyId],
        );
        if (!p) throw notFound("Property not found.");
        if (requestedUnit) {
          const unit = await one(tx, `select id from property_units where id = $1 and property_id = $2`, [requestedUnit, input.propertyId]);
          if (!unit) throw new DomainError("VALIDATION", "Choose a unit in this property.", { unitId: ["Invalid unit"] });
          unitId = requestedUnit;
        }
        propertyId = input.propertyId;
        location = { line1: p.line1, landmark: null, pincode: p.pincode };
        occupancy = membership!.memberRole === "TENANT" ? "TENANT" : "MANAGER";
        costApproval = "PROPERTY";
      } else if (input.savedAddressId) {
        const a = await one<{ line1: string; landmark: string | null; pincode: string }>(
          tx,
          `select line1, landmark, pincode from addresses where id = $1 and profile_id = $2`,
          [input.savedAddressId, actor.userId],
        );
        if (!a) throw notFound("Saved address not found.");
        location = a;
      } else {
        const a = input.address!;
        location = { line1: a.line1, landmark: a.landmark ?? null, pincode: a.pincode };
      }
      if (costApproval === "LANDLORD") selfLimit = input.selfApprovalLimit ? rupeesToPaise(input.selfApprovalLimit) : 0;

      const coverage = await coverageFor(tx, location.pincode);
      if (coverage.status !== "SERVED" || !coverage.area || !coverage.city) {
        throw new DomainError("VALIDATION", "We don't serve this pincode yet. You can join the waitlist and we'll let you know.", {
          "address.pincode": ["Not served yet"],
        });
      }
      if (!coverage.categoryIds.includes(category.id)) {
        throw new DomainError("VALIDATION", `${category.name} isn't available in ${coverage.area.name} yet.`, { categoryId: ["Not available here"] });
      }

      if (input.assetId) {
        const asset = await one<{ owner_id: string | null; property_id: string | null; unit_id: string | null }>(
          tx,
          `select owner_id, property_id, unit_id from assets where id = $1`,
          [input.assetId],
        );
        const ok =
          asset &&
          ((asset.owner_id && asset.owner_id === actor.userId && !propertyId) ||
            (asset.property_id && asset.property_id === propertyId && (!unitId || !asset.unit_id || asset.unit_id === unitId)));
        if (!ok) throw forbidden("That appliance isn't in your records.");
      }

      // Serialise capacity checks for this category, area and window.
      await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, [`${category.id}|${coverage.area.id}|${slot.start.toISOString()}`]);
      const cap = await windowCapacity(tx, category.id, coverage.area.id, slot);
      if (cap.technicians === 0) throw conflict("No professional is available in that window. Please choose another time.");
      if (cap.remaining <= 0) throw conflict("That window just filled up. Please choose another time.");

      const id = newId();
      const reference = bookingReference();
      await tx.query(
        `insert into bookings (id, reference, customer_id, property_id, unit_id, category_id, asset_id, problem_description,
           locality, city, window_key, slot_start, slot_end, status, visit_fee_paise, indicative_min_paise, indicative_max_paise,
           cancellation_terms, payment_method, idempotency_key, service_area_id, occupancy, cost_approval, requester_approval_limit_paise)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'REQUESTED',$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          id,
          reference,
          actor.userId,
          propertyId,
          unitId,
          category.id,
          input.assetId ?? null,
          input.problemDescription,
          coverage.area.name,
          coverage.city.name,
          slot.windowKey,
          slot.start,
          slot.end,
          category.visit_fee_paise,
          category.indicative_min_paise,
          category.indicative_max_paise,
          cancellationPolicy.summary,
          input.paymentMethod,
          input.idempotencyKey,
          coverage.area.id,
          occupancy,
          costApproval,
          selfLimit,
        ],
      );
      await tx.query(`insert into booking_locations (booking_id, line1, landmark, pincode) values ($1, $2, $3, $4)`, [
        id,
        location.line1,
        location.landmark,
        location.pincode,
      ]);
      await tx.query(
        `insert into booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, note)
         values ($1, null, 'REQUESTED', $2, 'REQUESTER', null)`,
        [id, actor.userId],
      );
      if (input.address && input.saveAddress && !propertyId) {
        await tx.query(
          `insert into addresses (profile_id, label, line1, landmark, locality, city, pincode) values ($1, 'Home', $2, $3, $4, $5, $6)`,
          [actor.userId, location.line1, location.landmark, coverage.area.name, coverage.city.name, location.pincode],
        );
      }
      await recordAudit(tx, actor, "booking.created", "booking", id, { category: category.slug, propertyId }, "REQUESTER");
      await notify(tx, await adminIds(tx), {
        kind: "booking_requested",
        title: `New request ${reference}`,
        body: `${category.name} in ${coverage.area.name}, ${coverage.city.name}`,
        link: `/admin/bookings/${id}`,
      });
      await notify(tx, [actor.userId], {
        kind: "booking_received",
        title: `Request ${reference} received`,
        body: `We'll confirm your ${category.name.toLowerCase()} visit shortly.`,
        link: propertyId ? `/pm/requests/${id}` : `/account/bookings/${id}`,
      });
      await track(
        tx,
        "booking_submitted",
        { category: category.slug, is_repeat: input.isRepeat, is_property: Boolean(propertyId), city: coverage.city.slug, occupancy, cost_approval: costApproval },
        opts.anonymousId ?? null,
      );
      return { id, reference, duplicate: false };
    }),
  );
}

// ---------------------------------------------------------------------------
// Requester actions
// ---------------------------------------------------------------------------

export async function cancelBooking(
  db: Database,
  actor: Actor,
  bookingId: string,
  reason: string,
  now: Date = new Date(),
): Promise<{ feePaise: number }> {
  const cleanReason = reason.trim().slice(0, 500) || "No reason given";
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const ctx = await bookingContextFor(tx, b, actor.userId);
      const relations = relationsTo(actor, b, ctx);
      if (!canChangeStatus(actor, b, "CANCELLED", ctx)) {
        if (relations.length === 0) throw notFound("Booking not found.");
        throw new DomainError("INVALID_TRANSITION", "This booking can no longer be cancelled here. Please contact support.");
      }
      const asRequester = relations.includes("requester");
      const feePaise = asRequester ? cancellationFeeFor(b, now) : 0;
      await moveStatus(tx, b, "CANCELLED", actor, primaryRelationLabel(relations, "requester"), cleanReason, {
        cancellation_reason: cleanReason,
        cancellation_fee_paise: feePaise,
        cancelled_by: actor.userId,
      });
      await notify(tx, [b.technicianId, ...(await requesterIds(tx, b)), ...(await adminIds(tx))].filter((id) => id !== actor.userId), {
        kind: "booking_cancelled",
        title: `${b.reference} cancelled`,
        body: `${b.categoryName} visit was cancelled.`,
      });
      await track(tx, "booking_cancelled", { category: b.categorySlug, status: b.status, fee_applied: feePaise > 0 });
      return { feePaise };
    }),
  );
}

export async function requestReschedule(
  db: Database,
  actor: Actor,
  bookingId: string,
  date: string,
  windowKey: string,
  now: Date = new Date(),
): Promise<void> {
  const slot = resolveSlot(date, windowKey);
  if (!slot || slot.start.getTime() < now.getTime() + schedulingPolicy.minLeadMinutes * 60000) {
    throw new DomainError("VALIDATION", "Choose a future time window.");
  }
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const ctx = await bookingContextFor(tx, b, actor.userId);
      if (!canChangeStatus(actor, b, "RESCHEDULE_REQUESTED", ctx)) {
        throw new DomainError("INVALID_TRANSITION", "This booking can't be rescheduled now.");
      }
      if (slot.start.getTime() === new Date(b.slotStart).getTime()) throw new DomainError("VALIDATION", "That's the current window.");
      await moveStatus(tx, b, "RESCHEDULE_REQUESTED", actor, "REQUESTER", `Requested ${date} ${windowKey}`, {
        requested_slot_start: slot.start,
        requested_slot_end: slot.end,
        requested_window_key: slot.windowKey,
      });
      await notify(tx, await adminIds(tx), {
        kind: "reschedule_requested",
        title: `Reschedule requested: ${b.reference}`,
        body: `Customer asked for ${date} (${windowKey}).`,
        link: `/admin/bookings/${b.id}`,
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// Technician actions
// ---------------------------------------------------------------------------

export async function acceptOffer(db: Database, actor: Actor, bookingId: string): Promise<void> {
  if (!isApprovedTechnician(actor)) throw forbidden("Only approved professionals can accept jobs.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const eligible = await isEligibleOffer(tx, b.id, actor.userId);
      if (!eligible) {
        throw conflict("This job is no longer available.");
      }
      if (!canChangeStatus(actor, b, "ASSIGNED", { isEligibleOffer: eligible })) throw forbidden();
      await moveStatus(tx, b, "ASSIGNED", actor, "TECHNICIAN", "Accepted by professional", {
        technician_id: actor.userId,
        assigned_at: new Date(),
      });
      await notify(tx, await requesterIds(tx, b), {
        kind: "technician_assigned",
        title: `Professional assigned for ${b.reference}`,
        body: `${actor.name} will handle your ${b.categoryName.toLowerCase()} visit.`,
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
      await track(tx, "technician_assigned", { category: b.categorySlug, source: "self" });
    }),
  );
}

export async function declineOffer(db: Database, actor: Actor, bookingId: string, reason: string): Promise<void> {
  if (!isApprovedTechnician(actor)) throw forbidden();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!(await isEligibleOffer(tx, b.id, actor.userId))) throw conflict("This job is no longer offered to you.");
      await tx.query(
        `insert into booking_offer_declines (booking_id, technician_id, reason) values ($1, $2, $3) on conflict do nothing`,
        [b.id, actor.userId, reason.trim().slice(0, 300) || null],
      );
      await recordAudit(tx, actor, "offer.declined", "booking", b.id, {}, "TECHNICIAN");
    }),
  );
}

/** Technician hands a job back before starting. Recorded for operations; no automatic penalty. */
export async function withdrawFromJob(db: Database, actor: Actor, bookingId: string, reason: string): Promise<void> {
  const cleanReason = reason.trim().slice(0, 500);
  if (cleanReason.length < 5) throw new DomainError("VALIDATION", "Please tell operations why you can't attend.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const relations = relationsTo(actor, b);
      if (!relations.includes("assigned_technician") || !canChangeStatus(actor, b, "CONFIRMED")) {
        throw new DomainError("INVALID_TRANSITION", "You can only hand back a job before you set off.");
      }
      await moveStatus(tx, b, "CONFIRMED", actor, "ASSIGNED_TECHNICIAN", `Professional withdrew: ${cleanReason}`, {
        technician_id: null,
        assigned_at: null,
      });
      await tx.query(
        `insert into booking_offer_declines (booking_id, technician_id, reason) values ($1, $2, $3) on conflict do nothing`,
        [b.id, actor.userId, cleanReason],
      );
      await notify(tx, [...(await adminIds(tx)), ...(await requesterIds(tx, b))], {
        kind: "technician_withdrew",
        title: `${b.reference} needs a new professional`,
        body: "The assigned professional can no longer attend. We're finding a replacement.",
      });
    }),
  );
}

export async function technicianProgress(
  db: Database,
  actor: Actor,
  bookingId: string,
  to: "EN_ROUTE" | "IN_PROGRESS",
): Promise<void> {
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!canChangeStatus(actor, b, to)) throw new DomainError("INVALID_TRANSITION", "That step isn't available for this job now.");
      await moveStatus(tx, b, to, actor, "ASSIGNED_TECHNICIAN", null);
      await notify(tx, await requesterIds(tx, b), {
        kind: to === "EN_ROUTE" ? "technician_en_route" : "work_started",
        title: to === "EN_ROUTE" ? `Your professional is on the way (${b.reference})` : `Work started on ${b.reference}`,
        body: to === "EN_ROUTE" ? "They will call you if they can't find the address." : "You'll be asked to approve any estimate before extra work.",
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// Operations (admin) actions
// ---------------------------------------------------------------------------

function requireAdmin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw forbidden("Operations access required.");
}

export async function adminConfirm(db: Database, actor: Actor, bookingId: string, note?: string): Promise<void> {
  requireAdmin(actor);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!canChangeStatus(actor, b, "CONFIRMED")) throw new DomainError("INVALID_TRANSITION", "Booking can't be confirmed from its current state.");
      await moveStatus(tx, b, "CONFIRMED", actor, "ADMIN", note?.trim() || null, { confirmed_at: new Date() });
      await notify(tx, await requesterIds(tx, b), {
        kind: "booking_confirmed",
        title: `${b.reference} confirmed`,
        body: `Your ${b.categoryName.toLowerCase()} visit is confirmed. We'll share the professional's details once assigned.`,
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
    }),
  );
}

export async function adminDecline(db: Database, actor: Actor, bookingId: string, reason: string): Promise<void> {
  requireAdmin(actor);
  const clean = reason.trim();
  if (clean.length < 5) throw new DomainError("VALIDATION", "Give the customer a reason.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!canChangeStatus(actor, b, "DECLINED")) throw new DomainError("INVALID_TRANSITION", "Booking can't be declined now.");
      await moveStatus(tx, b, "DECLINED", actor, "ADMIN", clean, { cancellation_reason: clean });
      await notify(tx, await requesterIds(tx, b), {
        kind: "booking_declined",
        title: `We couldn't take ${b.reference}`,
        body: clean,
      });
    }),
  );
}

export async function adminAssign(db: Database, actor: Actor, bookingId: string, technicianId: string, note?: string): Promise<void> {
  requireAdmin(actor);
  if (!z.uuid().safeParse(technicianId).success) throw new DomainError("VALIDATION", "Choose a professional.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const tech = await one<{ status: string; capable: boolean; serves_area: boolean; name: string }>(
        tx,
        `select tp.verification_status as status, p.full_name as name,
                exists (select 1 from technician_capabilities where technician_id = tp.profile_id and category_id = $2) as capable,
                exists (select 1 from technician_service_areas where technician_id = tp.profile_id and service_area_id = $3) as serves_area
         from technician_profiles tp join profiles p on p.id = tp.profile_id where tp.profile_id = $1`,
        [technicianId, b.categoryId, b.serviceAreaId],
      );
      if (!tech) throw notFound("Professional not found.");
      if (tech.status !== "APPROVED") throw new DomainError("VALIDATION", "Only approved professionals can be assigned.");
      if (!tech.capable) throw new DomainError("VALIDATION", `${tech.name} isn't listed for ${b.categoryName}.`);

      const reassign = b.status === "ASSIGNED";
      if (!reassign && !canChangeStatus(actor, b, "ASSIGNED")) {
        throw new DomainError("INVALID_TRANSITION", "This booking can't be assigned from its current state.");
      }
      if (reassign && b.technicianId === technicianId) throw new DomainError("VALIDATION", "Already assigned to this professional.");
      const previous = b.technicianId;
      const fields: Record<string, unknown> = { technician_id: technicianId, assigned_at: new Date() };
      if (b.status === "REQUESTED") fields.confirmed_at = new Date();
      const notes = [reassign ? "Reassigned by operations" : "Assigned by operations", !tech.serves_area ? "(outside listed area)" : "", note?.trim()]
        .filter(Boolean)
        .join(" ");
      await moveStatus(tx, b, "ASSIGNED", actor, "ADMIN", notes, fields);
      await notify(tx, [technicianId], {
        kind: "job_assigned",
        title: `New job ${b.reference}`,
        body: `${b.categoryName} in ${b.locality}`,
        link: `/tech/jobs/${b.id}`,
      });
      if (previous && previous !== technicianId) {
        await notify(tx, [previous], {
          kind: "job_reassigned",
          title: `${b.reference} was reassigned`,
          body: "Operations moved this job to another professional. Contact support if this is unexpected.",
        });
      }
      await notify(tx, await requesterIds(tx, b), {
        kind: "technician_assigned",
        title: `Professional assigned for ${b.reference}`,
        body: `${tech.name} will handle your visit.`,
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
      await track(tx, "technician_assigned", { category: b.categorySlug, source: reassign ? "reassign" : "admin" });
    }),
  );
}

export async function adminUnassign(db: Database, actor: Actor, bookingId: string, reason: string): Promise<void> {
  requireAdmin(actor);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!b.technicianId || !canChangeStatus(actor, b, "CONFIRMED")) {
        throw new DomainError("INVALID_TRANSITION", "Nothing to unassign in the current state.");
      }
      await moveStatus(tx, b, "CONFIRMED", actor, "ADMIN", reason.trim() || "Unassigned by operations", {
        technician_id: null,
        assigned_at: null,
      });
      await notify(tx, [b.technicianId], {
        kind: "job_unassigned",
        title: `${b.reference} was unassigned`,
        body: reason.trim() || "Operations unassigned this job.",
      });
    }),
  );
}

export async function adminRescheduleDecision(db: Database, actor: Actor, bookingId: string, approve: boolean): Promise<void> {
  requireAdmin(actor);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (b.status !== "RESCHEDULE_REQUESTED") throw new DomainError("INVALID_TRANSITION", "No reschedule request pending.");
      const clear = { requested_slot_start: null, requested_slot_end: null, requested_window_key: null };
      if (approve) {
        if (!b.requestedSlotStart || !b.requestedSlotEnd || !b.requestedWindowKey) throw new DomainError("VALIDATION", "No requested window.");
        await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, [`${b.categoryId}|${b.serviceAreaId}|${new Date(b.requestedSlotStart).toISOString()}`]);
        const requested = resolveSlot(localDateOf(new Date(b.requestedSlotStart)), b.requestedWindowKey);
        const cap = requested ? await windowCapacity(tx, b.categoryId, b.serviceAreaId, requested) : null;
        if (!cap || cap.technicians === 0) throw conflict("No professional is available in the requested window.");
        if (cap.remaining <= 0) throw conflict("The requested window is full.");
        await moveStatus(tx, b, "CONFIRMED", actor, "ADMIN", "Reschedule approved", {
          ...clear,
          slot_start: b.requestedSlotStart,
          slot_end: b.requestedSlotEnd,
          window_key: b.requestedWindowKey,
          technician_id: null,
          assigned_at: null,
        });
        if (b.technicianId) {
          await notify(tx, [b.technicianId], {
            kind: "job_rescheduled",
            title: `${b.reference} was rescheduled`,
            body: "The customer moved this visit. It has been released from your schedule.",
          });
        }
      } else {
        await moveStatus(tx, b, b.technicianId ? "ASSIGNED" : "CONFIRMED", actor, "ADMIN", "Reschedule not possible; original window kept", clear);
      }
      await notify(tx, await requesterIds(tx, b), {
        kind: "reschedule_decision",
        title: approve ? `${b.reference} rescheduled` : `${b.reference}: original time kept`,
        body: approve ? "Your new window is confirmed." : "We couldn't move your visit. Your original window is unchanged.",
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
    }),
  );
}

