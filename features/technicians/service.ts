import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { forbidden } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { hasRole } from "@/lib/permissions";
import { parseOrThrow, technicianProfileSchema } from "@/lib/validation";
import type { Actor, PayoutStatus, TechnicianVerification } from "@/types/domain";

export interface TechnicianProfileView {
  profileId: string;
  name: string;
  phone: string | null;
  bio: string | null;
  yearsExperience: number | null;
  verificationStatus: TechnicianVerification;
  reviewNotes: string | null;
  categoryIds: string[];
  serviceAreaIds: string[];
  availability: string[]; // "weekday:window" e.g. "1:09-11"
}

export async function getTechnicianProfile(db: Database, actor: Actor, technicianId: string = actor.userId): Promise<TechnicianProfileView | null> {
  return db.asUser(actor.userId, async (tx) => {
    const p = await one<Omit<TechnicianProfileView, "categoryIds" | "serviceAreaIds" | "availability">>(
      tx,
      `select tp.profile_id as "profileId", p.full_name as name, c.phone, tp.bio, tp.years_experience as "yearsExperience",
              tp.verification_status as "verificationStatus", tp.review_notes as "reviewNotes"
       from technician_profiles tp join profiles p on p.id = tp.profile_id left join profile_contacts c on c.profile_id = tp.profile_id
       where tp.profile_id = $1`,
      [technicianId],
    );
    if (!p) return null;
    const caps = await tx.query<{ category_id: string }>(`select category_id from technician_capabilities where technician_id = $1`, [technicianId]);
    const areas = await tx.query<{ service_area_id: string }>(`select service_area_id from technician_service_areas where technician_id = $1`, [technicianId]);
    const slots = await tx.query<{ weekday: number; window_key: string }>(
      `select weekday, window_key from availability_slots where technician_id = $1 order by weekday, window_key`,
      [technicianId],
    );
    return {
      ...p,
      categoryIds: caps.map((c) => c.category_id),
      serviceAreaIds: areas.map((a) => a.service_area_id),
      availability: slots.map((s) => `${s.weekday}:${s.window_key}`),
    };
  });
}

/** Technicians edit their own profile. Changing services or areas does not change verification status. */
export async function updateTechnicianProfile(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  if (!hasRole(actor, "TECHNICIAN")) throw forbidden();
  const input = parseOrThrow(technicianProfileSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(
        `insert into technician_profiles (profile_id, bio, years_experience) values ($1, $2, $3)
         on conflict (profile_id) do update set bio = excluded.bio, years_experience = excluded.years_experience`,
        [actor.userId, input.bio ?? null, input.yearsExperience],
      );
      await tx.query(
        `insert into profile_contacts (profile_id, phone) values ($1, $2) on conflict (profile_id) do update set phone = excluded.phone, updated_at = now()`,
        [actor.userId, input.phone],
      );
      const valid = await tx.query<{ id: string }>(`select id from service_categories where id = any($1::uuid[]) and is_active`, [input.categoryIds]);
      await tx.query(`delete from technician_capabilities where technician_id = $1`, [actor.userId]);
      for (const c of valid) {
        await tx.query(`insert into technician_capabilities (technician_id, category_id) values ($1, $2)`, [actor.userId, c.id]);
      }
      await tx.query(`delete from technician_service_areas where technician_id = $1`, [actor.userId]);
      const areas = await tx.query<{ id: string }>(`select id from service_areas where id = any($1::uuid[]) and status <> 'PAUSED'`, [input.serviceAreaIds]);
      for (const a of areas) {
        await tx.query(`insert into technician_service_areas (technician_id, service_area_id) values ($1, $2)`, [actor.userId, a.id]);
      }
      await tx.query(`delete from availability_slots where technician_id = $1`, [actor.userId]);
      for (const a of new Set(input.availability)) {
        const [weekday, windowKey] = a.split(":");
        await tx.query(`insert into availability_slots (technician_id, weekday, window_key) values ($1, $2, $3)`, [actor.userId, Number(weekday), windowKey]);
      }
      await recordAudit(tx, actor, "technician.profile_updated", "technician", actor.userId, { categories: valid.length, areas: areas.length }, "TECHNICIAN");
    }),
  );
}

export interface PayoutRow {
  id: string;
  bookingId: string;
  bookingReference: string;
  categoryName: string;
  amountPaise: number;
  status: PayoutStatus;
  breakdown: {
    visitFeeSharePaise: number;
    labourSharePaise: number;
    partsReimbursementPaise: number;
    additionalSharePaise: number;
    platformFeePaise: number;
  };
  note: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export async function listMyPayouts(db: Database, actor: Actor): Promise<PayoutRow[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<PayoutRow>(
      `select t.id, t.booking_id as "bookingId", b.reference as "bookingReference", c.name as "categoryName", t.amount_paise as "amountPaise",
              t.status, t.breakdown, t.note, t.paid_at as "paidAt", t.created_at as "createdAt"
       from technician_payouts t join bookings b on b.id = t.booking_id join service_categories c on c.id = b.category_id
       where t.technician_id = $1 order by t.created_at desc`,
      [actor.userId],
    ),
  );
}

export async function myReviewSummary(db: Database, actor: Actor) {
  const rows = await db.asUser(actor.userId, (tx) =>
    tx.query<{ review_count: number; average_rating: string | null }>(`select * from technician_rating_summary($1)`, [actor.userId]),
  );
  return { reviewCount: rows[0]?.review_count ?? 0, averageRating: rows[0]?.average_rating ? Number(rows[0].average_rating) : null };
}
