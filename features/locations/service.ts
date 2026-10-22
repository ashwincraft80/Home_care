import type { Database, Queryable } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { hasRole } from "@/lib/permissions";
import { parseOrThrow, pincodeSchema } from "@/lib/validation";
import type { Actor } from "@/types/domain";
import { z } from "zod";

export type CoverageStatus = "SERVED" | "AREA_NOT_LIVE" | "CITY_NOT_LIVE" | "UNKNOWN_PINCODE";

export interface Coverage {
  pincode: string;
  status: CoverageStatus;
  area: { id: string; name: string; status: string } | null;
  city: { id: string; slug: string; name: string; status: string; timeZone: string; supportPhone: string | null; supportEmail: string | null } | null;
  /** Category ids bookable at this pincode (empty unless SERVED). */
  categoryIds: string[];
}

/** Whether a pincode is in an operational service area. Works inside a transaction or as anon. */
export async function coverageFor(tx: Queryable, pincode: string): Promise<Coverage> {
  const row = await one<{
    area_id: string;
    area_name: string;
    area_status: string;
    city_id: string;
    city_slug: string;
    city_name: string;
    city_status: string;
    time_zone: string;
    support_phone: string | null;
    support_email: string | null;
  }>(
    tx,
    `select a.id as area_id, a.name as area_name, a.status as area_status, c.id as city_id, c.slug as city_slug, c.name as city_name,
            c.status as city_status, c.time_zone, c.support_phone, c.support_email
     from service_area_pincodes p join service_areas a on a.id = p.service_area_id join cities c on c.id = a.city_id
     where p.pincode = $1`,
    [pincode],
  );
  if (!row) return { pincode, status: "UNKNOWN_PINCODE", area: null, city: null, categoryIds: [] };
  const city = {
    id: row.city_id,
    slug: row.city_slug,
    name: row.city_name,
    status: row.city_status,
    timeZone: row.time_zone,
    supportPhone: row.support_phone,
    supportEmail: row.support_email,
  };
  const area = { id: row.area_id, name: row.area_name, status: row.area_status };
  if (!["LIVE", "PILOT"].includes(row.city_status)) return { pincode, status: "CITY_NOT_LIVE", area, city, categoryIds: [] };
  if (row.area_status !== "LIVE") return { pincode, status: "AREA_NOT_LIVE", area, city, categoryIds: [] };
  const cats = await tx.query<{ category_id: string }>(
    `select sac.category_id from service_area_categories sac join service_categories sc on sc.id = sac.category_id
     where sac.service_area_id = $1 and sc.is_active`,
    [row.area_id],
  );
  return { pincode, status: "SERVED", area, city, categoryIds: cats.map((c) => c.category_id) };
}

export async function checkCoverage(db: Database, rawPincode: string, opts: { anonymousId?: string | null; categorySlug?: string } = {}): Promise<Coverage> {
  const pincode = parseOrThrow(pincodeSchema, rawPincode);
  const coverage = await db.asUser(null, (tx) => coverageFor(tx, pincode));
  if (coverage.status !== "SERVED") {
    await db.transaction((tx) =>
      track(tx, "unavailable_area_encountered", { status: coverage.status, city: coverage.city?.slug ?? null, category: opts.categorySlug ?? null }, opts.anonymousId ?? null),
    );
  }
  return coverage;
}

export interface CityCoverageSummary {
  id: string;
  slug: string;
  name: string;
  state: string;
  status: string;
  liveAreas: string[];
  plannedAreas: string[];
}

/** Public coverage overview for the city selector. Status comes from operations config, never assumed. */
export async function listCityCoverage(db: Database): Promise<CityCoverageSummary[]> {
  return db.asUser(null, (tx) =>
    tx.query<CityCoverageSummary>(
      `select c.id, c.slug, c.name, c.state, c.status,
              coalesce((select array_agg(a.name order by a.name) from service_areas a where a.city_id = c.id and a.status = 'LIVE'), '{}') as "liveAreas",
              coalesce((select array_agg(a.name order by a.name) from service_areas a where a.city_id = c.id and a.status <> 'LIVE'), '{}') as "plannedAreas"
       from cities c order by c.sort_order, c.name`,
    ),
  );
}

export async function listLiveAreas(db: Database) {
  return db.asUser(null, (tx) =>
    tx.query<{ id: string; name: string; cityName: string }>(
      `select a.id, a.name, c.name as "cityName" from service_areas a join cities c on c.id = a.city_id
       where a.status = 'LIVE' and c.status in ('LIVE','PILOT') order by c.sort_order, a.name`,
    ),
  );
}

const waitlistSchema = z
  .object({
    pincode: pincodeSchema,
    categoryId: z.uuid().optional(),
    email: z.email({ error: "Enter a valid email" }).optional().or(z.literal("").transform(() => undefined)),
    consent: z.boolean().default(false),
  })
  .refine((v) => !v.email || v.consent, { message: "Please agree to be contacted about availability", path: ["consent"] });

/** Registers interest in an unserved area. Stores an email only with explicit consent. */
export async function joinWaitlist(db: Database, actor: Actor | null, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(waitlistSchema, rawInput);
  if (!actor && !input.email) throw new DomainError("VALIDATION", "Sign in or leave an email so we can tell you when we arrive.", { email: ["Required"] });
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const cov = await coverageFor(tx, input.pincode);
      const dup = await one(
        tx,
        `select 1 from service_waitlist where pincode = $1 and ((profile_id is not null and profile_id = $2) or (contact_email is not null and lower(contact_email) = lower($3)))`,
        [input.pincode, actor?.userId ?? null, input.email ?? null],
      );
      if (dup) return;
      await tx.query(
        `insert into service_waitlist (pincode, city_id, category_id, profile_id, contact_email, consent_at) values ($1,$2,$3,$4,$5,$6)`,
        [input.pincode, cov.city?.id ?? null, input.categoryId ?? null, actor?.userId ?? null, input.email ?? null, input.email ? new Date() : null],
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Operations configuration
// ---------------------------------------------------------------------------

function requireAdmin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw forbidden("Operations access required.");
}

export async function getCoverageAdmin(db: Database, actor: Actor) {
  requireAdmin(actor);
  return db.asUser(actor.userId, async (tx) => {
    const cities = await tx.query<{ id: string; slug: string; name: string; state: string; status: string; timeZone: string; supportPhone: string | null; supportEmail: string | null; escalationContact: string | null; waitlist: number }>(
      `select c.id, c.slug, c.name, c.state, c.status, c.time_zone as "timeZone", c.support_phone as "supportPhone",
              c.support_email as "supportEmail", c.escalation_contact as "escalationContact",
              (select count(*)::int from service_waitlist w where w.city_id = c.id) as waitlist
       from cities c order by c.sort_order, c.name`,
    );
    const areas = await tx.query<{ id: string; cityId: string; name: string; status: string; pincodes: string[]; categoryIds: string[]; technicians: number; waitlist: number }>(
      `select a.id, a.city_id as "cityId", a.name, a.status,
              coalesce((select array_agg(pincode order by pincode) from service_area_pincodes p where p.service_area_id = a.id), '{}') as pincodes,
              coalesce((select array_agg(category_id) from service_area_categories s where s.service_area_id = a.id), '{}') as "categoryIds",
              (select count(*)::int from technician_service_areas t join technician_profiles tp on tp.profile_id = t.technician_id
                 where t.service_area_id = a.id and tp.verification_status = 'APPROVED') as technicians,
              (select count(*)::int from service_waitlist w join service_area_pincodes p on p.pincode = w.pincode where p.service_area_id = a.id) as waitlist
       from service_areas a where app.is_admin() order by a.name`,
    );
    const unmatchedWaitlist = await tx.query<{ pincode: string; n: number }>(
      `select w.pincode, count(*)::int as n from service_waitlist w
       where not exists (select 1 from service_area_pincodes p where p.pincode = w.pincode) and app.is_admin()
       group by w.pincode order by n desc limit 20`,
    );
    return { cities, areas, unmatchedWaitlist };
  });
}

const cityUpdateSchema = z.object({
  cityId: z.uuid(),
  status: z.enum(["LIVE", "PILOT", "COMING_SOON", "PAUSED"]),
  supportPhone: z.string().trim().max(20).optional().transform((v) => v || null),
  supportEmail: z.string().trim().max(120).optional().transform((v) => v || null),
  escalationContact: z.string().trim().max(200).optional().transform((v) => v || null),
});

export async function updateCity(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  requireAdmin(actor);
  const input = parseOrThrow(cityUpdateSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const prev = await one<{ status: string }>(tx, `select status from cities where id = $1 for update`, [input.cityId]);
      if (!prev) throw notFound("City not found.");
      await tx.query(
        `update cities set status = $2, support_phone = $3, support_email = $4, escalation_contact = $5 where id = $1`,
        [input.cityId, input.status, input.supportPhone, input.supportEmail, input.escalationContact],
      );
      await recordAudit(tx, actor, "city.updated", "city", input.cityId, { from: prev.status, to: input.status }, "ADMIN");
    }),
  );
}

const areaSchema = z.object({
  areaId: z.uuid().optional(),
  cityId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  status: z.enum(["LIVE", "PAUSED", "PLANNED"]),
  pincodes: z
    .string()
    .transform((v) => [...new Set(v.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean))])
    .pipe(z.array(pincodeSchema).max(50, "At most 50 pincodes per area")),
  categoryIds: z.array(z.uuid()).default([]),
});

export async function saveArea(db: Database, actor: Actor, rawInput: unknown): Promise<{ id: string }> {
  requireAdmin(actor);
  const input = parseOrThrow(areaSchema, rawInput);
  if (input.status === "LIVE" && input.pincodes.length === 0) throw new DomainError("VALIDATION", "A live area needs at least one pincode.", { pincodes: ["Required"] });
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      let id = input.areaId;
      if (id) {
        const prev = await one<{ status: string }>(tx, `select status from service_areas where id = $1 for update`, [id]);
        if (!prev) throw notFound("Area not found.");
        await tx.query(`update service_areas set name = $2, status = $3 where id = $1`, [id, input.name, input.status]);
      } else {
        id = (await one<{ id: string }>(tx, `insert into service_areas (city_id, name, status) values ($1,$2,$3) returning id`, [input.cityId, input.name, input.status]))!.id;
      }
      const taken = await tx.query<{ pincode: string }>(
        `select pincode from service_area_pincodes where pincode = any($1::text[]) and service_area_id <> $2`,
        [input.pincodes, id],
      );
      if (taken.length) throw new DomainError("VALIDATION", `Pincode ${taken[0].pincode} already belongs to another area.`, { pincodes: ["Duplicate"] });
      await tx.query(`delete from service_area_pincodes where service_area_id = $1`, [id]);
      for (const p of input.pincodes) await tx.query(`insert into service_area_pincodes (pincode, service_area_id) values ($1, $2)`, [p, id]);
      await tx.query(`delete from service_area_categories where service_area_id = $1`, [id]);
      for (const c of input.categoryIds) await tx.query(`insert into service_area_categories (service_area_id, category_id) values ($1, $2)`, [id, c]);
      await recordAudit(tx, actor, input.areaId ? "service_area.updated" : "service_area.created", "service_area", id!, {
        status: input.status,
        pincodes: input.pincodes.length,
        categories: input.categoryIds.length,
      }, "ADMIN");
      return { id: id! };
    }),
  );
}
