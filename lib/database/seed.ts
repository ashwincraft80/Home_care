/**
 * Seed data.
 *
 * seedCatalog: service categories from lib/config/catalog.ts. Safe for any environment (idempotent).
 * seedDemoData: fictional demo personas and bookings. ONLY for the embedded demo database.
 *   Every name is suffixed "(Demo)", every email is @example.com and every phone number is a
 *   non-dialable placeholder. No real personal data is ever seeded.
 */
import { categorySeeds } from "@/lib/config/catalog";
import { citySeeds } from "@/lib/config/cities";
import { cancellationPolicy } from "@/lib/config/site";
import { computeEstimate, computeInvoiceAmounts, computePayout } from "@/features/estimates/calc";
import { addDays, localDateKey, resolveSlot } from "@/lib/time";
import type { Database, Queryable } from "./types";

export async function seedCatalog(tx: Queryable): Promise<void> {
  for (const c of categorySeeds) {
    await tx.query(
      `insert into service_categories (slug, name, name_hi, icon, short_description, description, common_jobs, asset_types,
         visit_fee_paise, indicative_min_paise, indicative_max_paise, warranty_days, warranty_exclusions, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9,$10,$11,$12,$13,$14)
       on conflict (slug) do nothing`,
      [
        c.slug,
        c.name,
        c.nameHi,
        c.icon,
        c.shortDescription,
        c.description,
        c.commonJobs,
        c.assetTypes,
        c.visitFeePaise,
        c.indicativeMinPaise,
        c.indicativeMaxPaise,
        c.warrantyDays,
        c.warrantyExclusions,
        c.sortOrder,
      ],
    );
  }
}

/** Cities, service areas, pincodes and per-area categories. Idempotent; safe for any environment. */
export async function seedCoverage(tx: Queryable): Promise<void> {
  const cats = await tx.query<{ slug: string; id: string }>(`select slug, id from service_categories`);
  let order = 0;
  for (const c of citySeeds) {
    const city = (
      await tx.query<{ id: string }>(
        `insert into cities (slug, name, state, time_zone, status, support_phone, support_email, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (slug) do update set name = excluded.name returning id`,
        [c.slug, c.name, c.state, c.timeZone, c.status, c.supportPhone, c.supportEmail, order++],
      )
    )[0];
    for (const a of c.areas) {
      const area = (
        await tx.query<{ id: string }>(
          `insert into service_areas (city_id, name, status) values ($1,$2,$3) on conflict (city_id, name) do update set name = excluded.name returning id`,
          [city.id, a.name, a.status],
        )
      )[0];
      for (const pin of a.pincodes) {
        await tx.query(`insert into service_area_pincodes (pincode, service_area_id) values ($1,$2) on conflict do nothing`, [pin, area.id]);
      }
      const enabled = a.categories === "*" ? cats : cats.filter((x) => (a.categories as string[]).includes(x.slug));
      for (const cat of enabled) {
        await tx.query(`insert into service_area_categories (service_area_id, category_id) values ($1,$2) on conflict do nothing`, [area.id, cat.id]);
      }
    }
  }
}

const id = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const demoUsers = {
  admin: id(1),
  customer: id(2),
  newCustomer: id(3),
  ravi: id(4),
  imran: id(5),
  suresh: id(6),
  applicant: id(7),
  meera: id(8),
  karthik: id(9),
  otherPm: id(10),
  student: id(11),
  partner: id(12),
  landlord: id(13),
  propertyTenant: id(14),
} as const;

export interface DemoPersona {
  id: string;
  name: string;
  role: "CUSTOMER" | "TECHNICIAN" | "PROPERTY_MANAGER" | "ADMIN";
  description: string;
}

export const demoPersonas: DemoPersona[] = [
  { id: demoUsers.customer, name: "Asha Rao (Demo)", role: "CUSTOMER", description: "Homeowner with bookings, appliances and history" },
  { id: demoUsers.partner, name: "Vikram Rao (Demo)", role: "CUSTOMER", description: "Asha's partner: follows and manages her bookings" },
  { id: demoUsers.student, name: "Priya S (Demo)", role: "CUSTOMER", description: "Student renting a shared flat; landlord approves costs" },
  { id: demoUsers.landlord, name: "Mr. Shetty (Demo)", role: "CUSTOMER", description: "Landlord invited to approve Priya's repair" },
  { id: demoUsers.newCustomer, name: "New Customer (Demo)", role: "CUSTOMER", description: "First-time customer with nothing booked yet" },
  { id: demoUsers.ravi, name: "Ravi Kumar (Demo)", role: "TECHNICIAN", description: "Approved electrician & plumber with active jobs" },
  { id: demoUsers.imran, name: "Imran Sheikh (Demo)", role: "TECHNICIAN", description: "Approved AC, appliance & RO professional" },
  { id: demoUsers.applicant, name: "Applicant (Demo)", role: "TECHNICIAN", description: "Technician whose profile is pending review" },
  { id: demoUsers.meera, name: "Meera Iyer (Demo)", role: "PROPERTY_MANAGER", description: "Owns two properties, approves estimates" },
  { id: demoUsers.karthik, name: "Karthik N (Demo)", role: "PROPERTY_MANAGER", description: "Manager with a ₹2,000 approval limit" },
  { id: demoUsers.propertyTenant, name: "Rohan Mehta (Demo)", role: "CUSTOMER", description: "Tenant of Lakeview A-102 (sees only his flat)" },
  { id: demoUsers.admin, name: "Operations Admin (Demo)", role: "ADMIN", description: "Operations console: queue, assignment, complaints" },
];

async function createUser(
  tx: Queryable,
  userId: string,
  name: string,
  email: string,
  phone: string,
  intent: "customer" | "technician" | "property_manager",
) {
  await tx.query(`insert into auth.users (id, email, phone, raw_user_meta_data) values ($1, $2, $3, $4::jsonb)`, [
    userId,
    email,
    phone,
    JSON.stringify({ full_name: name, signup_intent: intent, terms_accepted: "true" }),
  ]);
}

interface HistoryStep {
  to: string;
  by: string | null;
  role: string;
  note?: string;
  hoursAfterCreate: number;
}

interface BookingSpec {
  id: string;
  reference: string;
  customerId: string;
  categorySlug: string;
  description: string;
  date: string;
  window: string;
  status: string;
  technicianId?: string;
  propertyId?: string;
  unitId?: string;
  assetId?: string;
  locality: string;
  line1: string;
  createdDaysAgo: number;
  history: HistoryStep[];
  occupancy?: "OWNER" | "TENANT" | "MANAGER";
  costApproval?: "REQUESTER" | "LANDLORD" | "PROPERTY";
  selfLimitPaise?: number | null;
}

async function categoryBySlug(tx: Queryable, slug: string) {
  const rows = await tx.query<{ id: string; visit_fee_paise: number; indicative_min_paise: number | null; indicative_max_paise: number | null; warranty_days: number; warranty_exclusions: string; name: string }>(
    `select id, visit_fee_paise, indicative_min_paise, indicative_max_paise, warranty_days, warranty_exclusions, name from service_categories where slug = $1`,
    [slug],
  );
  return rows[0];
}

async function insertBooking(tx: Queryable, s: BookingSpec, now: Date) {
  const cat = await categoryBySlug(tx, s.categorySlug);
  const slot = resolveSlot(s.date, s.window)!;
  const area = (await tx.query<{ id: string }>(`select id from service_areas where name = $1`, [s.locality]))[0];
  const createdAt = new Date(now.getTime() - s.createdDaysAgo * 86400000);
  await tx.query(
    `insert into bookings (id, reference, customer_id, property_id, unit_id, category_id, asset_id, problem_description, locality, city,
       window_key, slot_start, slot_end, status, technician_id, visit_fee_paise, indicative_min_paise, indicative_max_paise,
       cancellation_terms, idempotency_key, created_at, assigned_at, confirmed_at, completed_at,
       service_area_id, occupancy, cost_approval, requester_approval_limit_paise)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Bengaluru',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
    [
      s.id,
      s.reference,
      s.customerId,
      s.propertyId ?? null,
      s.unitId ?? null,
      cat.id,
      s.assetId ?? null,
      s.description,
      s.locality,
      s.window,
      slot.start,
      slot.end,
      s.status,
      s.technicianId ?? null,
      cat.visit_fee_paise,
      cat.indicative_min_paise,
      cat.indicative_max_paise,
      cancellationPolicy.summary,
      `seed-${s.reference}`,
      createdAt,
      s.technicianId ? new Date(createdAt.getTime() + 3 * 3600000) : null,
      s.status === "REQUESTED" ? null : new Date(createdAt.getTime() + 3600000),
      s.status === "COMPLETED" ? slot.end : null,
      area.id,
      s.occupancy ?? (s.propertyId ? "MANAGER" : "OWNER"),
      s.costApproval ?? (s.propertyId ? "PROPERTY" : "REQUESTER"),
      s.selfLimitPaise ?? null,
    ],
  );
  await tx.query(`insert into booking_locations (booking_id, line1, landmark, pincode) values ($1, $2, $3, '560034')`, [
    s.id,
    s.line1,
    "Demo landmark",
  ]);
  let from: string | null = null;
  for (const step of [{ to: "REQUESTED", by: s.customerId, role: "REQUESTER", hoursAfterCreate: 0 } as HistoryStep, ...s.history]) {
    await tx.query(
      `insert into booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, note, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [s.id, from, step.to, step.by, step.role, step.note ?? null, new Date(createdAt.getTime() + step.hoursAfterCreate * 3600000)],
    );
    from = step.to;
  }
  return cat;
}

async function insertEstimate(
  tx: Queryable,
  opts: {
    id: string;
    bookingId: string;
    technicianId: string;
    visitFeePaise: number;
    diagnosis: string;
    items: { kind: "LABOUR" | "PART" | "ADDITIONAL"; description: string; quantity: number; unitPricePaise: number }[];
    decision?: { by: string; role: string; decision: "APPROVED" | "REJECTED"; payer?: string };
    validHours: number;
    now: Date;
  },
) {
  const t = computeEstimate(opts.visitFeePaise, opts.items);
  await tx.query(
    `insert into estimates (id, booking_id, version, kind, technician_id, diagnosis, visit_fee_paise, labour_paise, parts_paise,
       additional_paise, total_paise, valid_until, exclusions, status)
     values ($1,$2,1,'INITIAL',$3,$4,$5,$6,$7,$8,$9,$10,$11,'SUBMITTED')`,
    [
      opts.id,
      opts.bookingId,
      opts.technicianId,
      opts.diagnosis,
      t.visitFeePaise,
      t.labourPaise,
      t.partsPaise,
      t.additionalPaise,
      t.totalPaise,
      new Date(opts.now.getTime() + opts.validHours * 3600000),
      "Concealed pipe or wall work not included unless listed.",
    ],
  );
  let pos = 0;
  for (const l of t.lines) {
    await tx.query(
      `insert into estimate_line_items (estimate_id, kind, description, quantity, unit_price_paise, total_paise, position) values ($1,$2,$3,$4,$5,$6,$7)`,
      [opts.id, l.kind, l.description, l.quantity, l.unitPricePaise, l.totalPaise, pos++],
    );
  }
  if (opts.decision) {
    await tx.query(
      `insert into estimate_approvals (estimate_id, decision, decided_by, decided_by_role, payer, total_paise_at_decision) values ($1,$2,$3,$4,$5,$6)`,
      [opts.id, opts.decision.decision, opts.decision.by, opts.decision.role, opts.decision.payer ?? "REQUESTER", t.totalPaise],
    );
    await tx.query(`update estimates set status = $2, decided_at = now() where id = $1`, [opts.id, opts.decision.decision]);
  }
  return t;
}

async function finalizeSeedBooking(
  tx: Queryable,
  opts: { bookingId: string; customerId: string; propertyId?: string; technicianId: string; assetId?: string; visitFeePaise: number; approved: ReturnType<typeof computeEstimate>[]; title: string; summary: string; date: string; invoiceNo: string; warrantyDays: number; exclusions: string; payoutStatus: string; paid: boolean },
) {
  const amounts = computeInvoiceAmounts(
    opts.visitFeePaise,
    opts.approved.map((a) => ({ kind: "INITIAL" as const, ...a })),
  );
  await tx.query(
    `insert into job_completions (booking_id, technician_id, checklist, work_summary, submitted_at, confirmed_by, confirmed_by_role, confirmed_at)
     values ($1,$2,$3::jsonb,$4,now() - interval '1 hour',$5,'CUSTOMER',now())`,
    [opts.bookingId, opts.technicianId, JSON.stringify({ workAreaCleaned: true, customerShownWork: true, oldPartsHandedOver: true, testedAfterRepair: true }), opts.summary, opts.customerId],
  );
  await tx.query(
    `insert into invoices (booking_id, number, customer_id, property_id, visit_fee_paise, labour_paise, parts_paise, additional_paise, total_paise,
       payment_status, paid_at, warranty_days, warranty_expires_on, warranty_terms, issued_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      opts.bookingId,
      opts.invoiceNo,
      opts.customerId,
      opts.propertyId ?? null,
      amounts.visitFeePaise,
      amounts.labourPaise,
      amounts.partsPaise,
      amounts.additionalPaise,
      amounts.totalPaise,
      opts.paid ? "PAID" : "UNPAID",
      opts.paid ? new Date() : null,
      opts.warrantyDays,
      addDays(opts.date, opts.warrantyDays),
      opts.exclusions,
      new Date(`${opts.date}T12:00:00Z`),
    ],
  );
  await tx.query(
    `insert into maintenance_records (asset_id, booking_id, owner_id, property_id, source, performed_on, title, details, cost_paise, created_by)
     values ($1,$2,$3,$4,'JOB',$5,$6,$7,$8,$9)`,
    [opts.assetId ?? null, opts.bookingId, opts.propertyId ? null : opts.customerId, opts.propertyId ?? null, opts.date, opts.title, opts.summary, amounts.totalPaise, opts.customerId],
  );
  const payout = computePayout(amounts);
  await tx.query(
    `insert into technician_payouts (booking_id, technician_id, amount_paise, breakdown, status, paid_at) values ($1,$2,$3,$4::jsonb,$5,$6)`,
    [opts.bookingId, opts.technicianId, payout.amountPaise, JSON.stringify(payout.breakdown), opts.payoutStatus, opts.payoutStatus === "PAID" ? new Date() : null],
  );
}

export async function seedDemoData(db: Database, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await seedCatalog(tx);
    await seedCoverage(tx);
    const areaIds = Object.fromEntries(
      (await tx.query<{ name: string; id: string }>(`select name, id from service_areas`)).map((r) => [r.name, r.id]),
    );
    const cats = Object.fromEntries(
      (await tx.query<{ slug: string; id: string }>(`select slug, id from service_categories`)).map((r) => [r.slug, r.id]),
    );

    await createUser(tx, demoUsers.admin, "Operations Admin (Demo)", "ops.demo@example.com", "+910000000001", "customer");
    await createUser(tx, demoUsers.customer, "Asha Rao (Demo)", "asha.demo@example.com", "+910000000002", "customer");
    await createUser(tx, demoUsers.newCustomer, "New Customer (Demo)", "new.demo@example.com", "+910000000003", "customer");
    await createUser(tx, demoUsers.ravi, "Ravi Kumar (Demo)", "ravi.demo@example.com", "+910000000004", "technician");
    await createUser(tx, demoUsers.imran, "Imran Sheikh (Demo)", "imran.demo@example.com", "+910000000005", "technician");
    await createUser(tx, demoUsers.suresh, "Suresh Gowda (Demo)", "suresh.demo@example.com", "+910000000006", "technician");
    await createUser(tx, demoUsers.applicant, "Applicant (Demo)", "applicant.demo@example.com", "+910000000007", "technician");
    await createUser(tx, demoUsers.meera, "Meera Iyer (Demo)", "meera.demo@example.com", "+910000000008", "property_manager");
    await createUser(tx, demoUsers.karthik, "Karthik N (Demo)", "karthik.demo@example.com", "+910000000009", "property_manager");
    await createUser(tx, demoUsers.otherPm, "Other Manager (Demo)", "other.pm.demo@example.com", "+910000000010", "property_manager");
    await createUser(tx, demoUsers.student, "Priya S (Demo)", "priya.demo@example.com", "+910000000011", "customer");
    await createUser(tx, demoUsers.partner, "Vikram Rao (Demo)", "vikram.demo@example.com", "+910000000012", "customer");
    await createUser(tx, demoUsers.landlord, "Mr. Shetty (Demo)", "landlord.demo@example.com", "+910000000013", "customer");
    await createUser(tx, demoUsers.propertyTenant, "Rohan Mehta (Demo)", "rohan.demo@example.com", "+910000000014", "customer");
    await tx.query(`insert into role_assignments (profile_id, role) values ($1, 'ADMIN')`, [demoUsers.admin]);

    const day = ["09-11", "11-13", "14-16", "16-18"];
    const techs: { id: string; status: string; years: number; bio: string; cats: string[]; areas: string[]; availability: [number, string][] }[] = [
      {
        id: demoUsers.ravi, status: "APPROVED", years: 9, bio: "Electrical and plumbing repairs for homes and small offices.",
        cats: ["electrician", "plumbing", "general-maintenance"], areas: ["Indiranagar", "Koramangala", "HSR Layout"],
        availability: [1, 2, 3, 4, 5, 6].flatMap((d) => day.map((w) => [d, w] as [number, string])),
      },
      {
        id: demoUsers.imran, status: "APPROVED", years: 7, bio: "Split and window AC servicing, washing machines and RO purifiers.",
        cats: ["ac-service", "appliance-repair", "ro-purifier"], areas: ["Koramangala", "Indiranagar", "HSR Layout"],
        // Works some evenings and Sunday mornings — these are the only evening/weekend windows offered for his services.
        availability: [
          ...[1, 2, 3, 4, 5, 6].flatMap((d) => day.map((w) => [d, w] as [number, string])),
          [2, "18-20"], [4, "18-20"], [0, "09-11"], [0, "11-13"],
        ],
      },
      {
        id: demoUsers.suresh, status: "APPROVED", years: 12, bio: "Inverter, battery and rooftop solar inspection.",
        cats: ["inverter-battery", "rooftop-solar", "electrician"], areas: ["HSR Layout", "Koramangala"],
        availability: [...[2, 3, 4, 5, 6].flatMap((d) => day.map((w) => [d, w] as [number, string])), [6, "18-20"]],
      },
      { id: demoUsers.applicant, status: "PENDING_REVIEW", years: 3, bio: "Applying for plumbing work.", cats: ["plumbing"], areas: ["Indiranagar"], availability: [] },
    ];
    for (const t of techs) {
      await tx.query(
        `update technician_profiles set verification_status = $2, years_experience = $3, bio = $4,
           reviewed_by = case when $2 = 'APPROVED' then $5::uuid end, reviewed_at = case when $2 = 'APPROVED' then now() end,
           review_notes = case when $2 = 'APPROVED' then 'Demo: documents and trade test recorded as reviewed.' end
         where profile_id = $1`,
        [t.id, t.status, t.years, t.bio, demoUsers.admin],
      );
      for (const slug of t.cats) await tx.query(`insert into technician_capabilities values ($1, $2)`, [t.id, cats[slug]]);
      for (const a of t.areas) await tx.query(`insert into technician_service_areas values ($1, $2)`, [t.id, areaIds[a]]);
      for (const [d, w] of t.availability) await tx.query(`insert into availability_slots values ($1, $2, $3)`, [t.id, d, w]);
    }

    // Asha's home and appliances
    await tx.query(
      `insert into addresses (profile_id, label, line1, landmark, locality, city, pincode) values ($1, 'Home', 'Flat 3B, Demo Apartments, 5th Cross', 'Near demo park', 'Koramangala', 'Bengaluru', '560034')`,
      [demoUsers.customer],
    );
    const today = localDateKey(now);
    const ac = id(101), ro = id(102), inverter = id(103), geyser = id(104);
    const assets: [string, string, string, string | null, string | null, string, string | null, string | null][] = [
      [ac, "AC", "Bedroom AC", "Daikin", "1.5 ton split", "Master bedroom", addDays(today, -700), addDays(today, 400)],
      [ro, "RO", "Kitchen water purifier", "Kent", null, "Kitchen", addDays(today, -500), null],
      [inverter, "INVERTER", "Home inverter", "Luminous", "1100 VA", "Utility area", addDays(today, -1100), null],
      [geyser, "GEYSER", "Bathroom geyser", null, null, "Main bathroom", null, null],
    ];
    for (const [aid, type, nick, brand, model, loc, installed, warranty] of assets) {
      await tx.query(
        `insert into assets (id, owner_id, asset_type, nickname, brand, model, location_in_home, installed_on, warranty_expires_on, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$2)`,
        [aid, demoUsers.customer, type, nick, brand, model, loc, installed, warranty],
      );
    }
    await tx.query(
      `insert into maintenance_records (asset_id, owner_id, source, performed_on, title, details, cost_paise, created_by)
       values ($1, $2, 'SELF_REPORTED', $3, 'Sediment filter replaced', 'Replaced by previous vendor; receipt not uploaded.', 45000, $2)`,
      [ro, demoUsers.customer, addDays(today, -150)],
    );

    // 1. Completed AC service (40 days ago)
    const b1 = id(201);
    const d1 = addDays(today, -40);
    const cat1 = await insertBooking(
      tx,
      {
        id: b1, reference: "HC-DEMO01", customerId: demoUsers.customer, categorySlug: "ac-service", assetId: ac,
        description: "AC is cooling weakly and the indoor unit drips water in the evening.", date: d1, window: "11-13",
        status: "COMPLETED", technicianId: demoUsers.imran, locality: "Koramangala", line1: "Flat 3B, Demo Apartments, 5th Cross", createdDaysAgo: 42,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.imran, role: "TECHNICIAN", note: "Accepted by professional", hoursAfterCreate: 3 },
          { to: "EN_ROUTE", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 48 },
          { to: "IN_PROGRESS", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 48.5 },
          { to: "AWAITING_APPROVAL", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", note: "Estimate v1 sent", hoursAfterCreate: 48.7 },
          { to: "IN_PROGRESS", by: demoUsers.customer, role: "CUSTOMER", note: "Estimate v1 approved", hoursAfterCreate: 48.8 },
          { to: "COMPLETION_PENDING", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 50 },
          { to: "COMPLETED", by: demoUsers.customer, role: "CUSTOMER", note: "Customer confirmed completion", hoursAfterCreate: 51 },
        ],
      },
      now,
    );
    const e1 = await insertEstimate(tx, {
      id: id(301), bookingId: b1, technicianId: demoUsers.imran, visitFeePaise: cat1.visit_fee_paise, now, validHours: -900,
      diagnosis: "Filters and coil clogged; drain pipe partially blocked.",
      items: [
        { kind: "LABOUR", description: "Jet cleaning of indoor and outdoor unit", quantity: 1, unitPricePaise: 59900 },
        { kind: "LABOUR", description: "Drain pipe flushing", quantity: 1, unitPricePaise: 15000 },
      ],
      decision: { by: demoUsers.customer, role: "CUSTOMER", decision: "APPROVED" },
    });
    await finalizeSeedBooking(tx, {
      bookingId: b1, customerId: demoUsers.customer, technicianId: demoUsers.imran, assetId: ac, visitFeePaise: cat1.visit_fee_paise,
      approved: [e1], title: "AC service & repair — HC-DEMO01", summary: "Jet-cleaned both units, flushed the drain line, checked cooling at 9°C differential.",
      date: d1, invoiceNo: "INV-DEMO-1001", warrantyDays: cat1.warranty_days, exclusions: cat1.warranty_exclusions, payoutStatus: "PAID", paid: true,
    });
    await tx.query(`insert into reviews (booking_id, author_id, technician_id, rating, comment) values ($1,$2,$3,5,'Explained the issue clearly before starting.')`, [b1, demoUsers.customer, demoUsers.imran]);

    // 2. Plumbing awaiting approval (today)
    const b2 = id(202);
    const cat2 = await insertBooking(
      tx,
      {
        id: b2, reference: "HC-DEMO02", customerId: demoUsers.customer, categorySlug: "plumbing",
        description: "Kitchen sink tap is leaking continuously and the cabinet below is getting wet.", date: today, window: "09-11",
        status: "AWAITING_APPROVAL", technicianId: demoUsers.ravi, locality: "Koramangala", line1: "Flat 3B, Demo Apartments, 5th Cross", createdDaysAgo: 1,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.admin, role: "ADMIN", note: "Assigned by operations", hoursAfterCreate: 2 },
          { to: "EN_ROUTE", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 20 },
          { to: "IN_PROGRESS", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 21 },
          { to: "AWAITING_APPROVAL", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", note: "Estimate v1 sent", hoursAfterCreate: 21.5 },
        ],
      },
      now,
    );
    await insertEstimate(tx, {
      id: id(302), bookingId: b2, technicianId: demoUsers.ravi, visitFeePaise: cat2.visit_fee_paise, now, validHours: 36,
      diagnosis: "Tap cartridge worn out; connection hose corroded.",
      items: [
        { kind: "LABOUR", description: "Replace tap cartridge and connection hose", quantity: 1, unitPricePaise: 25000 },
        { kind: "PART", description: "Ceramic tap cartridge (standard)", quantity: 1, unitPricePaise: 32000 },
        { kind: "PART", description: "Braided connection hose 18 inch", quantity: 1, unitPricePaise: 18000 },
      ],
    });

    // 3. Confirmed RO service, unassigned — open offer for Imran
    await insertBooking(
      tx,
      {
        id: id(203), reference: "HC-DEMO03", customerId: demoUsers.customer, categorySlug: "ro-purifier", assetId: ro,
        description: "Water from the purifier tastes different and the flow is slow.", date: addDays(today, 2), window: "11-13",
        status: "CONFIRMED", locality: "Koramangala", line1: "Flat 3B, Demo Apartments, 5th Cross", createdDaysAgo: 0,
        history: [{ to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 0.5 }],
      },
      now,
    );

    // 4. Electrician job awaiting the customer's completion confirmation
    const b4 = id(204);
    await insertBooking(
      tx,
      {
        id: b4, reference: "HC-DEMO04", customerId: demoUsers.customer, categorySlug: "electrician",
        description: "Bedroom MCB trips whenever the geyser and AC run together.", date: addDays(today, -1), window: "14-16",
        status: "COMPLETION_PENDING", technicianId: demoUsers.ravi, locality: "Koramangala", line1: "Flat 3B, Demo Apartments, 5th Cross", createdDaysAgo: 3,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.ravi, role: "TECHNICIAN", note: "Accepted by professional", hoursAfterCreate: 2 },
          { to: "EN_ROUTE", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 47 },
          { to: "IN_PROGRESS", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 48 },
          { to: "COMPLETION_PENDING", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", note: "Professional marked work complete", hoursAfterCreate: 49 },
        ],
      },
      now,
    );
    await tx.query(
      `insert into job_completions (booking_id, technician_id, checklist, work_summary, submitted_at) values ($1, $2, $3::jsonb, $4, now() - interval '20 hours')`,
      [b4, demoUsers.ravi, JSON.stringify({ workAreaCleaned: true, customerShownWork: true, oldPartsHandedOver: false, testedAfterRepair: true }), "Diagnosed overload on bedroom circuit. No parts replaced. Advised not to run geyser and AC on the same circuit; quote for a separate circuit can be requested."],
    );

    // 5. Requested inverter visit (needs operations confirmation)
    await insertBooking(
      tx,
      {
        id: id(205), reference: "HC-DEMO05", customerId: demoUsers.customer, categorySlug: "inverter-battery", assetId: inverter,
        description: "Inverter backup dropped from 3 hours to under 1 hour.", date: addDays(today, 3), window: "16-18",
        status: "REQUESTED", locality: "Koramangala", line1: "Flat 3B, Demo Apartments, 5th Cross", createdDaysAgo: 0, history: [],
      },
      now,
    );

    // Property manager data
    const p1 = id(401), p2 = id(402), p3 = id(403);
    await tx.query(
      `insert into properties (id, name, property_type, line1, locality, city, pincode, created_by) values
         ($1, 'Lakeview Residency (Demo)', 'APARTMENT_BLOCK', '12 Demo Lake Road', 'Koramangala', 'Bengaluru', '560034', $4),
         ($2, 'Indiranagar Office (Demo)', 'COMMERCIAL', '100 Feet Road, Demo Building', 'Indiranagar', 'Bengaluru', '560038', $4),
         ($3, 'Hillside Villas (Demo)', 'RESIDENTIAL', '8 Demo Hill Street', 'HSR Layout', 'Bengaluru', '560102', $5)`,
      [p1, p2, p3, demoUsers.meera, demoUsers.otherPm],
    );
    await tx.query(`update properties set service_area_id = (select id from service_areas where name = locality)`);
    const uA101 = id(501), uA102 = id(502), uB201 = id(503), uOffice = id(504), uVilla = id(505);
    await tx.query(
      `insert into property_units (id, property_id, label) values ($1,$6,'A-101'),($2,$6,'A-102'),($3,$6,'B-201'),($4,$7,'Ground floor'),($5,$8,'Villa 4')`,
      [uA101, uA102, uB201, uOffice, uVilla, p1, p2, p3],
    );
    await tx.query(
      `insert into property_memberships (property_id, profile_id, member_role, approval_limit_paise) values
         ($1, $4, 'OWNER', null), ($2, $4, 'OWNER', null), ($1, $5, 'MANAGER', 200000), ($3, $6, 'OWNER', null)`,
      [p1, p2, p3, demoUsers.meera, demoUsers.karthik, demoUsers.otherPm],
    );
    // Rohan rents A-102 and may approve small repairs (up to ₹500) himself.
    await tx.query(
      `insert into property_memberships (property_id, profile_id, member_role, unit_id, approval_limit_paise) values ($1, $2, 'TENANT', $3, 50000)`,
      [p1, demoUsers.propertyTenant, uA102],
    );
    // Vikram can follow and manage Asha's bookings, approving up to ₹3,000.
    await tx.query(`insert into household_members (owner_id, member_id, access, approval_limit_paise) values ($1, $2, 'MANAGE', 300000)`, [
      demoUsers.customer,
      demoUsers.partner,
    ]);
    await tx.query(
      `insert into assets (id, property_id, unit_id, asset_type, nickname, brand, location_in_home, installed_on, created_by) values
         ($1, $3, $4, 'GEYSER', 'A-101 geyser', 'Racold', 'Bathroom', $6, $5),
         ($2, $3, null, 'SOLAR', 'Rooftop solar array', null, 'Terrace', $7, $5)`,
      [id(106), id(107), p1, uA101, demoUsers.meera, addDays(today, -900), addDays(today, -400)],
    );

    const b6 = id(206);
    const cat6 = await insertBooking(
      tx,
      {
        id: b6, reference: "HC-DEMO06", customerId: demoUsers.meera, propertyId: p1, unitId: uA101, categorySlug: "plumbing",
        description: "Tenant reports a leak under the bathroom wash basin; water is reaching the floor.", date: today, window: "11-13",
        status: "AWAITING_APPROVAL", technicianId: demoUsers.ravi, locality: "Koramangala", line1: "12 Demo Lake Road, A-101", createdDaysAgo: 1,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.admin, role: "ADMIN", note: "Assigned by operations", hoursAfterCreate: 2 },
          { to: "EN_ROUTE", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 22 },
          { to: "IN_PROGRESS", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 23 },
          { to: "AWAITING_APPROVAL", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", note: "Estimate v1 sent", hoursAfterCreate: 23.5 },
        ],
      },
      now,
    );
    await insertEstimate(tx, {
      id: id(303), bookingId: b6, technicianId: demoUsers.ravi, visitFeePaise: cat6.visit_fee_paise, now, validHours: 40,
      diagnosis: "Basin waste coupling cracked and wall-mixer washer worn.",
      items: [
        { kind: "LABOUR", description: "Replace basin waste coupling and bottle trap", quantity: 1, unitPricePaise: 45000 },
        { kind: "PART", description: "Basin waste set with bottle trap", quantity: 1, unitPricePaise: 125000 },
        { kind: "PART", description: "Mixer washer set", quantity: 2, unitPricePaise: 6000 },
        { kind: "ADDITIONAL", description: "Silicone sealing around basin", quantity: 1, unitPricePaise: 12000 },
      ],
    });

    const b7 = id(207);
    const d7 = addDays(today, -25);
    const cat7 = await insertBooking(
      tx,
      {
        id: b7, reference: "HC-DEMO07", customerId: demoUsers.meera, propertyId: p2, unitId: uOffice, categorySlug: "electrician",
        description: "Two light points in the reception area are not working.", date: d7, window: "09-11",
        status: "COMPLETED", technicianId: demoUsers.ravi, locality: "Indiranagar", line1: "100 Feet Road, Demo Building", createdDaysAgo: 27,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.ravi, role: "TECHNICIAN", hoursAfterCreate: 2 },
          { to: "EN_ROUTE", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 46 },
          { to: "IN_PROGRESS", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 47 },
          { to: "AWAITING_APPROVAL", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 47.2 },
          { to: "IN_PROGRESS", by: demoUsers.meera, role: "PROPERTY_OWNER", note: "Estimate v1 approved", hoursAfterCreate: 47.5 },
          { to: "COMPLETION_PENDING", by: demoUsers.ravi, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 48 },
          { to: "COMPLETED", by: demoUsers.meera, role: "PROPERTY_MANAGER", hoursAfterCreate: 50 },
        ],
      },
      now,
    );
    const e7 = await insertEstimate(tx, {
      id: id(304), bookingId: b7, technicianId: demoUsers.ravi, visitFeePaise: cat7.visit_fee_paise, now, validHours: -500,
      diagnosis: "Loose neutral at the switchboard; one LED driver failed.",
      items: [
        { kind: "LABOUR", description: "Switchboard rewiring (2 points)", quantity: 2, unitPricePaise: 15000 },
        { kind: "PART", description: "LED panel driver 18W", quantity: 1, unitPricePaise: 42000 },
      ],
      decision: { by: demoUsers.meera, role: "PROPERTY_OWNER", decision: "APPROVED" },
    });
    await finalizeSeedBooking(tx, {
      bookingId: b7, customerId: demoUsers.meera, propertyId: p2, technicianId: demoUsers.ravi, visitFeePaise: cat7.visit_fee_paise,
      approved: [e7], title: "Electrician — HC-DEMO07", summary: "Tightened neutral connections, replaced one LED driver, tested both points.",
      date: d7, invoiceNo: "INV-DEMO-1002", warrantyDays: cat7.warranty_days, exclusions: cat7.warranty_exclusions, payoutStatus: "PENDING", paid: false,
    });

    await insertBooking(
      tx,
      {
        id: id(208), reference: "HC-DEMO08", customerId: demoUsers.meera, propertyId: p1, unitId: uB201, categorySlug: "ac-service",
        description: "Pre-summer service for the bedroom split AC in B-201 before new tenants move in.", date: addDays(today, 1), window: "14-16",
        status: "ASSIGNED", technicianId: demoUsers.imran, locality: "Koramangala", line1: "12 Demo Lake Road, B-201", createdDaysAgo: 1,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.imran, role: "TECHNICIAN", note: "Accepted by professional", hoursAfterCreate: 4 },
        ],
      },
      now,
    );
    await insertBooking(
      tx,
      {
        id: id(209), reference: "HC-DEMO09", customerId: demoUsers.propertyTenant, propertyId: p1, unitId: uA102, categorySlug: "general-maintenance", occupancy: "TENANT",
        description: "Mount a 43-inch TV on the living room wall; bracket is available.", date: addDays(today, 4), window: "11-13",
        status: "REQUESTED", locality: "Koramangala", line1: "12 Demo Lake Road, A-102", createdDaysAgo: 0,
        history: [],
      },
      now,
    );
    // Another manager's property — used to demonstrate isolation.
    await insertBooking(
      tx,
      {
        id: id(210), reference: "HC-DEMO10", customerId: demoUsers.otherPm, propertyId: p3, unitId: uVilla, categorySlug: "rooftop-solar",
        description: "Quarterly panel cleaning for the villa rooftop system.", date: addDays(today, 5), window: "09-11",
        status: "REQUESTED", locality: "HSR Layout", line1: "8 Demo Hill Street, Villa 4", createdDaysAgo: 0, history: [],
      },
      now,
    );

    // Student in a shared rented flat; the landlord approves costs above ₹300.
    const b11 = id(211);
    const cat11 = await insertBooking(
      tx,
      {
        id: b11, reference: "HC-DEMO11", customerId: demoUsers.student, categorySlug: "appliance-repair",
        description: "Washing machine in our shared flat stops mid-cycle and doesn't drain.", date: today, window: "14-16",
        status: "AWAITING_APPROVAL", technicianId: demoUsers.imran, locality: "HSR Layout", line1: "Flat 204, Demo Residency, 27th Main", createdDaysAgo: 1,
        occupancy: "TENANT", costApproval: "LANDLORD", selfLimitPaise: 30000,
        history: [
          { to: "CONFIRMED", by: demoUsers.admin, role: "ADMIN", hoursAfterCreate: 1 },
          { to: "ASSIGNED", by: demoUsers.imran, role: "TECHNICIAN", note: "Accepted by professional", hoursAfterCreate: 2 },
          { to: "EN_ROUTE", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 20 },
          { to: "IN_PROGRESS", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", hoursAfterCreate: 21 },
          { to: "AWAITING_APPROVAL", by: demoUsers.imran, role: "ASSIGNED_TECHNICIAN", note: "Estimate v1 sent", hoursAfterCreate: 21.5 },
        ],
      },
      now,
    );
    await insertEstimate(tx, {
      id: id(305), bookingId: b11, technicianId: demoUsers.imran, visitFeePaise: cat11.visit_fee_paise, now, validHours: 40,
      diagnosis: "Drain pump is jammed and its impeller is cracked.",
      items: [
        { kind: "LABOUR", description: "Replace drain pump and clean filter", quantity: 1, unitPricePaise: 45000 },
        { kind: "PART", description: "Drain pump (compatible, front-load)", quantity: 1, unitPricePaise: 120000 },
      ],
    });
    await tx.query(`insert into booking_approvers (booking_id, profile_id, relation) values ($1, $2, 'LANDLORD')`, [b11, demoUsers.landlord]);

    // A resolved complaint for the support centre demo
    const c1 = id(601);
    await tx.query(
      `insert into complaints (id, reference, booking_id, raised_by, raised_by_role, category, description, status, resolution, resolved_at, created_at)
       values ($1, 'CM-DEMO01', $2, $3, 'CUSTOMER', 'QUALITY', 'AC indoor unit started dripping again two days after the service.', 'RESOLVED',
               'Professional revisited under workmanship warranty and re-sloped the drain pipe. No charge.', now() - interval '30 days', now() - interval '36 days')`,
      [c1, b1, demoUsers.customer],
    );
    await tx.query(
      `insert into complaint_updates (complaint_id, author_id, author_role, message, status_change, created_at) values
         ($1, $2, 'ADMIN', 'Thanks for reporting this. We have scheduled a free revisit under the workmanship warranty.', 'IN_REVIEW', now() - interval '35 days'),
         ($1, $2, 'ADMIN', 'Revisit done; drain pipe re-sloped. Marking resolved — reply here if it recurs.', 'RESOLVED', now() - interval '30 days')`,
      [c1, demoUsers.admin],
    );

    await tx.query(
      `insert into notifications (recipient_id, kind, title, body, link) values
         ($1, 'estimate_submitted', 'Estimate ready for HC-DEMO02', 'Review the itemised estimate. No extra work starts until you approve.', $2),
         ($1, 'completion_submitted', 'Please confirm HC-DEMO04 is complete', 'Check the work, then confirm or raise an issue.', $3),
         ($4, 'estimate_submitted', 'Estimate ready for HC-DEMO06', 'A-101 basin leak: estimate awaiting your approval.', $5),
         ($6, 'estimate_submitted', 'Priya needs your approval (HC-DEMO11)', 'Washing machine repair estimate is above her ₹300 limit.', $7)`,
      [demoUsers.customer, `/account/bookings/${b2}`, `/account/bookings/${b4}`, demoUsers.meera, `/pm/requests/${b6}`, demoUsers.landlord, `/account/bookings/${b11}`],
    );
    await tx.query(`insert into app.schema_migrations (name) values ('demo_seed') on conflict do nothing`);
  });
}

export async function isSeeded(db: Database): Promise<boolean> {
  const rows = await db.query<{ n: number }>(`select count(*)::int as n from app.schema_migrations where name = 'demo_seed'`);
  return (rows[0]?.n ?? 0) > 0;
}
