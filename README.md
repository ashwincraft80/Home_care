# HomeCare

**Your home, taken care of.** Reliable home services that fit your schedule — with visit fees shown
before you book, itemised estimates you approve before extra work, and a maintenance record for
every appliance.

V1 web app for Indian home services and property maintenance: customers (including renters,
households and landlords), technicians, property managers and an operations admin.

## Quick start (demo mode — no accounts or keys needed)

Requires Node.js ≥ 20.9. (On this machine Node is installed at `~/.local/node`, so run
`export PATH="$HOME/.local/node/bin:$PATH"` first in each new terminal.)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000 and click **Log in** → pick a demo persona. `.env.development` sets
`HOMECARE_MODE=demo`, which runs the real schema, RLS and triggers on embedded Postgres (PGlite)
under `.data/demo` with fictional seeded data.

Reset the demo data at any time:

```bash
npm run demo:reset
```

### Demo personas
| Persona | Role | Try |
|---|---|---|
| Asha Rao | Customer | Bookings, approve an estimate, confirm completion, home passport |
| Vikram Rao | Customer (household) | Manages Asha's bookings within a ₹3,000 limit |
| Priya S | Customer (student tenant) | Booking where the landlord approves costs |
| Mr. Shetty | Customer (landlord) | Approves Priya's ₹1,849 estimate via an invitation |
| New Customer | Customer | First booking from scratch |
| Ravi Kumar / Imran Sheikh | Technician | Offers, jobs, estimates, completion, payouts |
| Applicant | Technician | Pending-review experience |
| Meera Iyer | Property manager (owner) | Properties, units, approvals |
| Karthik N | Property manager | ₹2,000 approval limit |
| Rohan Mehta | Tenant | Sees only Lakeview A-102 |
| Operations Admin | Admin | Queue, assignment, complaints, pricing, cities & areas, metrics |

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (Vitest; integration runs real migrations + RLS on in-memory PGlite) |
| `npm run test:e2e` | Playwright (builds and serves on port 3200 with a fresh demo DB; uses installed Chrome) |
| `npm run check` | typecheck + lint + test |
| `npm run demo:seed` / `demo:reset` | Seed / wipe and reseed demo data |
| `npm run db:migrate` | Apply `supabase/migrations` to `DATABASE_URL` |
| `npm run db:seed:catalog` | Seed services, cities and coverage (no people) into `DATABASE_URL` |
| `npm run db:grant-admin -- <email>` | Grant ADMIN to an existing user (audited) |

## Supabase setup (real accounts)
1. Create a Supabase project (region close to India, e.g. Mumbai).
2. Copy `.env.example` → `.env.local`, set `HOMECARE_MODE=supabase` and fill the Supabase values.
   `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` are **server-only**.
3. Apply migrations: `npm run db:migrate` (or `supabase db push` with the Supabase CLI).
4. Seed the catalogue and coverage: `npm run db:seed:catalog`. Review prices and pincodes in the admin console afterwards.
5. In Supabase Auth settings set the Site URL and add `<your-url>/auth/callback` as a redirect URL.
6. Sign up through the app, then `npm run db:grant-admin -- you@yourcompany.in`.

Production refuses to start without `HOMECARE_MODE`; it never falls back to demo data.

## What's real vs. not yet connected
**Working end to end:** service areas and pincode coverage (with waitlist), honest time windows from
professional availability, booking wizard with idempotency, status workflow with history, technician
offers/assignment, itemised estimates with approval by customer/household/landlord/property roles,
supplementary estimates, customer-confirmed completion → invoice + warranty + maintenance record +
payout (all in one transaction), complaints, home maintenance passport with service suggestions,
property/unit/tenant management, secure invitations, uploads with type sniffing, admin console and
metrics from real data, English/Hindi chrome, interactive 3D home with static fallback.

**Boundaries only — not connected:** SMS/OTP, email, WhatsApp, payments (invoices say "Pay the professional by UPI or cash;
online payment isn't available yet"), maps/geocoding, third-party technician
verification, live location tracking. The UI never claims these work.

## Documentation
- [docs/product-decisions.md](docs/product-decisions.md) — why things work the way they do
- [docs/security.md](docs/security.md) — auth, authorisation layers, data minimisation
- [docs/research-to-product.md](docs/research-to-product.md) — sources, findings, hypotheses
- [docs/launch-checklist.md](docs/launch-checklist.md) — what remains before a public launch

## Project layout
```
app/                 routes: (site) public pages, account/, tech/, pm/, admin/, support/, api/
components/          ui/ primitives, domain/ shared app pieces, motion/ loaders & illustrations
features/            domain modules: bookings, estimates, complaints, assets, properties,
                     technicians, admin, locations, invitations, uploads, home-explorer, …
lib/                 config/ (brand, catalogue, cities, env), database/, auth/, permissions/,
                     validation/, integrations/, analytics/, i18n/, money, time, rate-limit
supabase/migrations  schema, RLS, auth trigger & storage bucket
tests/               unit/, integration/ (PGlite + RLS), e2e/ (Playwright)
```

Brand name, logo text, currency, contact details, launch city and policies are configured in
`lib/config/site.ts`.
