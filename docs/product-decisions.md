# Product & technical decisions

Short records of the decisions behind V1, so they can be revisited deliberately.

## Product

**Positioning.** "Your home, taken care of." Homepage hero: "A happier home starts here."
Supporting value proposition: reliable home maintenance, with clear pricing and a record of every
repair. We compete on transparency, accountability, the home maintenance passport, and fairness
to professionals — not on breadth of catalogue.

**Pricing transparency.**
- Every booking snapshots the visit fee, indicative range and cancellation terms at submission;
  later price changes by operations never affect existing bookings.
- Indicative ranges are labelled "typical, not a quote". A confirmed price exists only as an
  approved itemised estimate (visit fee, labour, parts with quantities, additional charges,
  validity, exclusions).
- Approval records **who** approved, **when**, the **exact total** they saw (the server rejects a
  decision if the total changed) and **who pays**. Approved estimates are immutable at the database
  level; extra work requires a separate supplementary estimate.

**Who approves costs (tenants, landlords, households).**
- Personal bookings: the customer approves. A household member with MANAGE access can approve up to
  the limit the owner set.
- Rented homes: the tenant chooses `I'll approve and pay` or `My landlord approves`. With landlord
  approval the tenant may set a small self-approval limit; anything above it waits for the landlord,
  who joins via a single-use invitation link and sees only that booking.
- Managed properties: owners approve anything; managers and tenants approve up to their limit;
  viewers can't approve. Tenants only ever see their own unit.
- Implemented in one pure function, `approvalAuthority()` (`lib/permissions`), unit-tested.

**Completion is confirmed by the customer, not the professional.** Technician submission moves the
job to `COMPLETION_PENDING`; the requester confirms (invoice, warranty, maintenance record and
payout are created atomically) or raises an issue (`DISPUTED`, complaint opened). Operations may
close on the customer's behalf only after 48 hours (configurable), and that is audited.

**Booking statuses.** `REQUESTED → CONFIRMED → ASSIGNED → EN_ROUTE → IN_PROGRESS →
AWAITING_APPROVAL → COMPLETION_PENDING → COMPLETED`, plus `CANCELLED`, `DECLINED`,
`RESCHEDULE_REQUESTED`, `DISPUTED`. We added `COMPLETION_PENDING` to keep "work submitted" distinct
from "customer confirmed". Allowed transitions and who may perform them live in
`features/bookings/state-machine.ts`; the database enforces the same pairs in a trigger, and a unit
test fails if the two ever diverge.

**Honest scheduling.** A time window is offered only if an approved professional who does that
service in that service area has marked themselves available for that weekday and window, and
operations capacity isn't full. Evening and Sunday windows appear only where that's true. No live
tracking or ETA is shown — the "on the way" state shows the booked window.

**Multi-city, launch narrow.** Cities, service areas, pincodes and per-area services are database
records managed in Admin → Cities & areas. Only LIVE areas in LIVE/PILOT cities accept bookings.
Unserved pincodes get a clear message and an optional, consent-based waitlist; those events are
tracked to guide expansion. The seed starts one pilot city with three live areas.

**Technician fairness.** Offers show area, window, problem and guaranteed visit earnings before
acceptance; declining is never penalised; handing back a job is recorded, not automatically
penalised; payouts are itemised with the platform share; ratings are hidden until five reviews.
Approval of a profile means operations reviewed it — we never display a "verified" badge because no
third-party ID/background check is integrated.

**Warranty.** Per-category workmanship warranty days and exclusions, stamped onto each invoice.
No universal guarantee is promised anywhere.

**Home maintenance passport.** Appliances need only a type and a name. Next-service suggestions
come from `serviceGuidance` in `lib/config/catalog.ts` — general operations defaults, always shown as
HomeCare guidance and never as a manufacturer claim or inspection result. Job records can't be
deleted by customers (they're service history); self-reported records and appliances can.

**Demo content.** All demo people and places are fictional and suffixed "(Demo)". No testimonials,
ratings, counts or partner logos are invented; illustrative examples are labelled "Example" or
"Illustration only".

## Architecture

**Modular monolith on Next.js 16 (App Router), TypeScript strict, Tailwind v4.** Domain logic lives
in `features/*/service.ts` and `lib/permissions`; pages and Server Actions are thin. No microservices.

**Cache Components off.** Nearly every page renders per-user data, so V1 uses fully dynamic
rendering (the previous model) for simplicity and to avoid accidental cross-user caching. Revisit
for public marketing pages when traffic justifies it.

**One SQL schema, two backends.**
- *Production:* Supabase Postgres via `DATABASE_URL` + Supabase Auth (`@supabase/ssr`) + private
  Supabase Storage.
- *Demo & tests:* the **same migrations** run on PGlite (embedded Postgres/WASM) under `.data/`, with
  a small shim (`supabase/local/shim.sql`) providing `auth.uid()`, `auth.users` and the
  `anon`/`authenticated` roles. RLS, triggers and constraints behave identically, so the test suite
  exercises real policies.
- Mode is selected by `HOMECARE_MODE`; production never falls back to demo.

**Reads under RLS, writes through the server.** Server reads run as the signed-in user (`set local
role authenticated` + JWT claims), so Row Level Security protects against our own query bugs.
Browsers have **no** insert/update/delete privileges on any table. Every write goes through a
service that loads facts inside a transaction (`select … for update`), authorises with pure
permission functions, and writes with the table owner. Critical multi-step operations (approval,
completion → invoice + record + payout) are single transactions.

**Integrity in the database, too.** Status-transition trigger, immutable price snapshot, immutable
estimate amounts and line items, append-only approval records / status history / audit log, unique
indexes preventing a technician double-booking a window and a customer duplicating an open booking,
idempotency keys on booking submission, advisory locks around capacity checks.

**Money** is integer paise everywhere (`lib/money.ts`); payout shares are basis points.
**Time** is `timestamptz`; windows are generated in the city's time zone (IST for current cities).

**Schema simplifications.** Availability is a weekly `(weekday, window)` table rather than dated
slots; job completion checklists are a JSON column on `job_completions`; booking addresses are
snapshotted in `booking_locations` (separate so open offers never expose them). Migrations were
edited in place before first deployment; from launch onwards, changes go in new migration files.

## Experience

**Liquid glass, used carefully.** Translucent surfaces (`glass`, `glass-strong`, `glass-bar`
utilities in `app/globals.css`) over a warm ambient background, with a top specular sheen placed
*behind* content so it never reduces text contrast. Solid fallbacks apply when `backdrop-filter`
isn't supported or the user prefers reduced transparency. Inner tiles inside a glass card use a
light fill without their own blur, to avoid stacked blur cost on phones.

**3D home.** Built with React Three Fiber + drei from primitives defined once in
`features/home-explorer/layout.ts` — **no third-party model or texture**, so there's no licence to
track. The same layout renders a static isometric SVG that is the server-rendered first paint, the
loading state and the fallback (no WebGL, data-saver, very low memory, render error, or 10 s of
*visible* loading). Materials are physically based with procedural canvas textures (oak planks,
tiles, solar cells) and procedural studio lighting (no HDR download). The scene pauses when
off-screen, lowers resolution and drops shadows/transmission on low-power devices, respects reduced
motion, and is optional: a plain list of the same home areas sits beneath it and the booking CTA is
always available.

**Home Reveal.** ~2 s assembly (foundation → walls → furniture → roof/solar → warm lights) with the
logo and tagline, first visit only, never blocking the hero text or CTA, skipped under reduced
motion.

**Motion maps to real states.** `components/motion/loaders.tsx`: assembly loader for route loads,
scan loader for home records, submit loader while a booking is in flight, "finding a professional"
only while a booking is confirmed and unassigned, "on the way" without fake tracking, estimate card
transition, and completion celebration only after the server confirms completion. Loaders never
delay a response; submit buttons disable while pending and restore on error.

**Language.** English and Hindi for navigation, home page, booking flow, statuses and dashboard
chrome; long policy pages stay English until reviewed by a native editor.

## Analytics

Internal `track()` writes to `analytics_events` with an allow-list of property keys and a filter
that drops anything resembling contact data. Anonymous ids are random cookies, not user ids. Admin
metrics are computed from real rows and show "Not enough data" below five observations.
