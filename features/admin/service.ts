import { metricsPolicy } from "@/lib/config/site";
import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { rupeesToPaise } from "@/lib/money";
import { hasRole } from "@/lib/permissions";
import { categoryConfigSchema, parseOrThrow } from "@/lib/validation";
import { notify } from "@/features/notifications/service";
import type { Actor, PayoutStatus, TechnicianVerification } from "@/types/domain";
import { z } from "zod";

function requireAdmin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw forbidden("Operations access required.");
}

export interface TechnicianDirectoryRow {
  profileId: string;
  name: string;
  phone: string | null;
  verificationStatus: TechnicianVerification;
  yearsExperience: number | null;
  categories: string[];
  localities: string[];
  activeJobs: number;
  completedJobs: number;
  openComplaints: number;
  createdAt: Date;
}

export async function listTechnicians(db: Database, actor: Actor, status?: string): Promise<TechnicianDirectoryRow[]> {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<TechnicianDirectoryRow>(
      `select tp.profile_id as "profileId", p.full_name as name, c.phone, tp.verification_status as "verificationStatus",
              tp.years_experience as "yearsExperience",
              coalesce((select array_agg(sc.name order by sc.sort_order) from technician_capabilities tc join service_categories sc on sc.id = tc.category_id where tc.technician_id = tp.profile_id), '{}') as categories,
              coalesce((select array_agg(a.name order by a.name) from technician_service_areas t join service_areas a on a.id = t.service_area_id where t.technician_id = tp.profile_id), '{}') as localities,
              (select count(*)::int from bookings b where b.technician_id = tp.profile_id and b.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL','COMPLETION_PENDING')) as "activeJobs",
              (select count(*)::int from bookings b where b.technician_id = tp.profile_id and b.status = 'COMPLETED') as "completedJobs",
              (select count(*)::int from complaints cm join bookings b on b.id = cm.booking_id where b.technician_id = tp.profile_id and cm.status not in ('RESOLVED','CLOSED') and cm.raised_by <> tp.profile_id) as "openComplaints",
              tp.created_at as "createdAt"
       from technician_profiles tp join profiles p on p.id = tp.profile_id left join profile_contacts c on c.profile_id = tp.profile_id
       where app.is_admin() and ($1::text is null or tp.verification_status = $1)
       order by case tp.verification_status when 'PENDING_REVIEW' then 0 else 1 end, p.full_name`,
      [status && status !== "ALL" ? status : null],
    ),
  );
}

/** Approved technicians who can do a booking's category, flagging area match and window conflicts. */
export async function eligibleTechniciansFor(db: Database, actor: Actor, bookingId: string) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ profileId: string; name: string; servesArea: boolean; busyInWindow: boolean; activeJobs: number }>(
      `select tp.profile_id as "profileId", p.full_name as name,
              exists (select 1 from technician_service_areas a where a.technician_id = tp.profile_id and a.service_area_id = b.service_area_id) as "servesArea",
              exists (select 1 from bookings o where o.technician_id = tp.profile_id and o.slot_start = b.slot_start and o.id <> b.id
                      and o.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL','COMPLETION_PENDING','RESCHEDULE_REQUESTED')) as "busyInWindow",
              (select count(*)::int from bookings o where o.technician_id = tp.profile_id and o.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL','COMPLETION_PENDING')) as "activeJobs"
       from bookings b
       join technician_capabilities tc on tc.category_id = b.category_id
       join technician_profiles tp on tp.profile_id = tc.technician_id and tp.verification_status = 'APPROVED'
       join profiles p on p.id = tp.profile_id
       where b.id = $1 and app.is_admin()
       order by "busyInWindow", "servesArea" desc, "activeJobs", p.full_name`,
      [bookingId],
    ),
  );
}

const reviewSchema = z.object({
  technicianId: z.uuid(),
  status: z.enum(["APPROVED", "SUSPENDED", "REJECTED", "PENDING_REVIEW"]),
  notes: z.string().trim().min(5, "Record what was checked or why").max(1000),
});

export async function reviewTechnician(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  requireAdmin(actor);
  const input = parseOrThrow(reviewSchema, rawInput);
  if (input.technicianId === actor.userId) throw forbidden("You can't review your own profile.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const prev = await one<{ verification_status: string }>(
        tx,
        `select verification_status from technician_profiles where profile_id = $1 for update`,
        [input.technicianId],
      );
      if (!prev) throw notFound("Professional not found.");
      if (input.status === "SUSPENDED") {
        const active = await one<{ n: number }>(
          tx,
          `select count(*)::int as n from bookings where technician_id = $1 and status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL')`,
          [input.technicianId],
        );
        if ((active?.n ?? 0) > 0) throw new DomainError("VALIDATION", "Reassign their active jobs before suspending.");
      }
      await tx.query(
        `update technician_profiles set verification_status = $2, review_notes = $3, reviewed_by = $4, reviewed_at = now() where profile_id = $1`,
        [input.technicianId, input.status, input.notes, actor.userId],
      );
      await recordAudit(tx, actor, "technician.reviewed", "technician", input.technicianId, { from: prev.verification_status, to: input.status }, "ADMIN");
      await notify(tx, [input.technicianId], {
        kind: "profile_reviewed",
        title: input.status === "APPROVED" ? "Your profile is approved" : `Profile status: ${input.status.replace("_", " ").toLowerCase()}`,
        body: input.notes,
        link: "/tech/profile",
      });
    }),
  );
}

export async function updateCategory(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  requireAdmin(actor);
  const input = parseOrThrow(categoryConfigSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const prev = await one<Record<string, unknown>>(
        tx,
        `select visit_fee_paise, indicative_min_paise, indicative_max_paise, warranty_days, is_active from service_categories where id = $1 for update`,
        [input.categoryId],
      );
      if (!prev) throw notFound("Category not found.");
      const next = {
        visit_fee_paise: rupeesToPaise(input.visitFee),
        indicative_min_paise: input.indicativeMin ? rupeesToPaise(input.indicativeMin) : null,
        indicative_max_paise: input.indicativeMax ? rupeesToPaise(input.indicativeMax) : null,
        warranty_days: input.warrantyDays,
        is_active: input.isActive,
      };
      await tx.query(
        `update service_categories set visit_fee_paise = $2, indicative_min_paise = $3, indicative_max_paise = $4, warranty_days = $5,
           warranty_exclusions = $6, short_description = $7, is_active = $8, updated_by = $9 where id = $1`,
        [
          input.categoryId,
          next.visit_fee_paise,
          next.indicative_min_paise,
          next.indicative_max_paise,
          next.warranty_days,
          input.warrantyExclusions,
          input.shortDescription,
          next.is_active,
          actor.userId,
        ],
      );
      // Existing bookings keep their price snapshot; only new bookings use the new values.
      await recordAudit(tx, actor, "category.updated", "service_category", input.categoryId, { before: prev, after: next }, "ADMIN");
    }),
  );
}

const payoutSchema = z.object({ payoutId: z.uuid(), status: z.enum(["PENDING", "PROCESSING", "PAID", "ON_HOLD"]), note: z.string().trim().max(500).optional() });

export async function updatePayoutStatus(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  requireAdmin(actor);
  const input = parseOrThrow(payoutSchema, rawInput);
  if (input.status === "ON_HOLD" && !input.note) throw new DomainError("VALIDATION", "Tell the professional why the payout is on hold.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const p = await one<{ technician_id: string; status: PayoutStatus; booking_id: string }>(
        tx,
        `select technician_id, status, booking_id from technician_payouts where id = $1 for update`,
        [input.payoutId],
      );
      if (!p) throw notFound("Payout not found.");
      if (p.status === "PAID") throw new DomainError("VALIDATION", "Paid payouts can't be changed. Record an adjustment instead.");
      await tx.query(
        `update technician_payouts set status = $2, note = coalesce($3, note), paid_at = case when $2 = 'PAID' then now() else null end where id = $1`,
        [input.payoutId, input.status, input.note ?? null],
      );
      await recordAudit(tx, actor, "payout.status_changed", "payout", input.payoutId, { from: p.status, to: input.status }, "ADMIN");
      await notify(tx, [p.technician_id], {
        kind: "payout_update",
        title: `Payout ${input.status.replace("_", " ").toLowerCase()}`,
        body: input.note ?? "Your payout status changed.",
        link: "/tech/earnings",
      });
    }),
  );
}

export async function listPayoutsAdmin(db: Database, actor: Actor) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; technicianName: string; bookingReference: string; bookingId: string; amountPaise: number; status: PayoutStatus; note: string | null; createdAt: Date }>(
      `select t.id, p.full_name as "technicianName", b.reference as "bookingReference", b.id as "bookingId", t.amount_paise as "amountPaise",
              t.status, t.note, t.created_at as "createdAt"
       from technician_payouts t join profiles p on p.id = t.technician_id join bookings b on b.id = t.booking_id
       where app.is_admin()
       order by case t.status when 'ON_HOLD' then 0 when 'PENDING' then 1 when 'PROCESSING' then 2 else 3 end, t.created_at desc limit 300`,
    ),
  );
}

export async function markInvoicePaid(db: Database, actor: Actor, invoiceId: string): Promise<void> {
  requireAdmin(actor);
  if (!z.uuid().safeParse(invoiceId).success) throw notFound();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const rows = await tx.query(`update invoices set payment_status = 'PAID', paid_at = now() where id = $1 and payment_status = 'UNPAID' returning id`, [invoiceId]);
      if (!rows.length) throw new DomainError("VALIDATION", "Invoice is not awaiting payment.");
      await recordAudit(tx, actor, "invoice.marked_paid", "invoice", invoiceId, {}, "ADMIN");
    }),
  );
}

export async function listUsers(db: Database, actor: Actor, q?: string) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; name: string; roles: string[]; email: string | null; phone: string | null; createdAt: Date; bookings: number }>(
      `select p.id, p.full_name as name, coalesce((select array_agg(role order by role) from role_assignments r where r.profile_id = p.id), '{}') as roles,
              c.email, c.phone, p.created_at as "createdAt",
              (select count(*)::int from bookings b where b.customer_id = p.id) as bookings
       from profiles p left join profile_contacts c on c.profile_id = p.id
       where app.is_admin() and ($1::text is null or p.full_name ilike '%' || $1 || '%' or c.email ilike '%' || $1 || '%')
       order by p.created_at desc limit 200`,
      [q?.trim() ? q.trim().slice(0, 60) : null],
    ),
  );
}

export async function auditTrailFor(db: Database, actor: Actor, entityId: string) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; action: string; actorRole: string | null; actorName: string | null; metadata: Record<string, unknown>; createdAt: Date }>(
      `select e.id, e.action, e.actor_role as "actorRole", p.full_name as "actorName", e.metadata, e.created_at as "createdAt"
       from audit_events e left join profiles p on p.id = e.actor_id where e.entity_id = $1 order by e.created_at desc limit 100`,
      [entityId],
    ),
  );
}

// ---------------------------------------------------------------------------
// Metrics — computed from real data only.
// ---------------------------------------------------------------------------

export interface Metric {
  key: string;
  label: string;
  value: number | null; // ratio 0..1, or hours for assignment time
  unit: "ratio" | "hours";
  numerator: number;
  denominator: number;
  definition: string;
  sufficient: boolean;
}

export async function getOperationalMetrics(
  db: Database,
  actor: Actor,
  windowDays = metricsPolicy.windowDays,
  cityId: string | null = null,
): Promise<{ metrics: Metric[]; windowDays: number; minimumSample: number; citySpecific: boolean }> {
  requireAdmin(actor);
  const since = new Date(Date.now() - windowDays * 86400000);
  const city = cityId && z.uuid().safeParse(cityId).success ? cityId : null;
  // Restricts a bookings alias to the chosen city (or all cities when null).
  const inCity = (alias: string, param: string) => `(${param}::uuid is null or ${alias}.service_area_id in (select id from service_areas where city_id = ${param}::uuid))`;
  const min = metricsPolicy.minimumSample;
  return db.asUser(actor.userId, async (tx) => {
    const ratio = (key: string, label: string, numerator: number, denominator: number, definition: string): Metric => ({
      key,
      label,
      unit: "ratio",
      numerator,
      denominator,
      definition,
      sufficient: denominator >= min,
      value: denominator >= min ? numerator / denominator : null,
    });

    const funnel = await one<{ started: number; submitted: number }>(
      tx,
      `select count(distinct anonymous_id) filter (where name = 'booking_started')::int as started,
              count(distinct anonymous_id) filter (where name = 'booking_submitted')::int as submitted
       from analytics_events where created_at >= $1 and anonymous_id is not null`,
      [since],
    );
    const b = await one<{ total: number; cancelled: number; completed: number; closed: number }>(
      tx,
      `select count(*)::int as total,
              count(*) filter (where status = 'CANCELLED')::int as cancelled,
              count(*) filter (where status = 'COMPLETED')::int as completed,
              count(*) filter (where status in ('COMPLETED','CANCELLED','DECLINED'))::int as closed
       from bookings b where b.created_at >= $1 and ${inCity("b", "$2")}`,
      [since, city],
    );
    const assign = await one<{ n: number; median_hours: number | null }>(
      tx,
      `with first_assign as (
         select b.id, b.created_at, min(h.created_at) as assigned_at
         from bookings b join booking_status_history h on h.booking_id = b.id and h.to_status = 'ASSIGNED'
         where b.created_at >= $1 and ${inCity("b", "$2")} group by b.id, b.created_at)
       select count(*)::int as n,
              (percentile_cont(0.5) within group (order by extract(epoch from (assigned_at - created_at)) / 3600.0))::float8 as median_hours
       from first_assign`,
      [since, city],
    );
    const est = await one<{ approved: number; decided: number }>(
      tx,
      `select count(*) filter (where a.decision = 'APPROVED')::int as approved, count(*)::int as decided
       from estimate_approvals a join estimates e on e.id = a.estimate_id join bookings b on b.id = e.booking_id
       where a.created_at >= $1 and ${inCity("b", "$2")}`,
      [since, city],
    );
    const compl = await one<{ with_complaint: number; completed: number }>(
      tx,
      `select count(*) filter (where exists (select 1 from complaints c where c.booking_id = b.id and c.raised_by_role <> 'TECHNICIAN'))::int as with_complaint,
              count(*)::int as completed
       from bookings b where b.status = 'COMPLETED' and b.completed_at >= $1 and ${inCity("b", "$2")}`,
      [since, city],
    );
    const repeat = await one<{ repeaters: number; customers: number }>(
      tx,
      `with c as (select customer_id, count(*) as n from bookings b where b.status not in ('DECLINED') and ${inCity("b", "$1")} group by customer_id)
       select count(*) filter (where n >= 2)::int as repeaters, count(*)::int as customers from c`,
      [city],
    );

    const metrics: Metric[] = [
      ratio("conversion", "Booking conversion", funnel?.submitted ?? 0, funnel?.started ?? 0, "Visitors who submitted a booking ÷ visitors who started the booking form (anonymous ids)."),
      {
        key: "assignment_time",
        label: "Median time to assign",
        unit: "hours",
        numerator: assign?.n ?? 0,
        denominator: assign?.n ?? 0,
        definition: "Median hours from booking request to first professional assignment.",
        sufficient: (assign?.n ?? 0) >= min,
        value: (assign?.n ?? 0) >= min ? assign?.median_hours ?? null : null,
      },
      ratio("cancellation", "Cancellation rate", b?.cancelled ?? 0, b?.total ?? 0, "Cancelled bookings ÷ all bookings created in the period."),
      ratio("estimate_approval", "Estimate approval rate", est?.approved ?? 0, est?.decided ?? 0, "Approved estimates ÷ estimates with a customer decision."),
      ratio("completion", "Completion rate", b?.completed ?? 0, b?.closed ?? 0, "Completed ÷ bookings that reached a final state (completed, cancelled, declined)."),
      ratio("complaint", "Complaint rate", compl?.with_complaint ?? 0, compl?.completed ?? 0, "Completed jobs with a customer complaint ÷ completed jobs."),
      ratio("repeat", "Repeat booking rate", repeat?.repeaters ?? 0, repeat?.customers ?? 0, "Customers with 2+ bookings ÷ customers with at least one booking (all time)."),
    ];
    // The booking-start funnel is anonymous and has no city, so conversion is only meaningful for all cities.
    if (city) metrics[0] = { ...metrics[0], value: null, sufficient: false, numerator: 0, denominator: 0, definition: `${metrics[0].definition} Not available per city (booking starts are anonymous and city-less).` };
    return { metrics, windowDays, minimumSample: min, citySpecific: Boolean(city) };
  });
}

export async function queueCounts(db: Database, actor: Actor) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    one<{ requested: number; unassigned: number; disputed: number; reschedule: number; openComplaints: number; pendingTechs: number; awaitingClose: number }>(
      tx,
      `select (select count(*)::int from bookings where status = 'REQUESTED') as requested,
              (select count(*)::int from bookings where status = 'CONFIRMED' and technician_id is null) as unassigned,
              (select count(*)::int from bookings where status = 'DISPUTED') as disputed,
              (select count(*)::int from bookings where status = 'RESCHEDULE_REQUESTED') as reschedule,
              (select count(*)::int from complaints where status in ('OPEN','IN_REVIEW','ESCALATED')) as "openComplaints",
              (select count(*)::int from technician_profiles where verification_status = 'PENDING_REVIEW') as "pendingTechs",
              (select count(*)::int from bookings where status = 'COMPLETION_PENDING') as "awaitingClose"
       where app.is_admin()`,
    ),
  );
}

export async function listUnpaidInvoices(db: Database, actor: Actor) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; number: string; bookingId: string; bookingReference: string; totalPaise: number; issuedAt: Date; customerName: string }>(
      `select i.id, i.number, i.booking_id as "bookingId", b.reference as "bookingReference", i.total_paise as "totalPaise", i.issued_at as "issuedAt",
              p.full_name as "customerName"
       from invoices i join bookings b on b.id = i.booking_id join profiles p on p.id = i.customer_id
       where i.payment_status = 'UNPAID' and app.is_admin() order by i.issued_at`,
    ),
  );
}

export async function cityBookingCounts(db: Database, actor: Actor) {
  requireAdmin(actor);
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ cityId: string; cityName: string; status: string; open: number; completed: number; total: number }>(
      `select c.id as "cityId", c.name as "cityName", c.status,
              count(b.id) filter (where b.status not in ('COMPLETED','CANCELLED','DECLINED'))::int as open,
              count(b.id) filter (where b.status = 'COMPLETED')::int as completed,
              count(b.id)::int as total
       from cities c left join service_areas a on a.city_id = c.id left join bookings b on b.service_area_id = a.id
       where app.is_admin() group by c.id, c.name, c.status, c.sort_order order by c.sort_order`,
    ),
  );
}
