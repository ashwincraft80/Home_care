# Security model

## Authentication
- **Supabase mode:** Supabase Auth (email + password) with `@supabase/ssr` cookie sessions. The
  proxy (`proxy.ts`) refreshes sessions; server code verifies the user with `auth.getUser()` (a call
  to the Auth server), never by trusting a cookie's contents.
- **Demo mode:** password-less personas with an HMAC-signed, HttpOnly, SameSite=Lax cookie. Only
  available when `HOMECARE_MODE=demo`; demo actions refuse to run otherwise.
- Sign-up intents can only create CUSTOMER, TECHNICIAN (pending review) or PROPERTY_MANAGER roles via
  a database trigger. **ADMIN is never self-assigned** — use `npm run db:grant-admin`.

## Authorisation (defence in depth)
1. **Server Actions / Route Handlers** re-read the session on every call (`lib/actions.ts`).
2. **Services** load facts inside a transaction and authorise with pure functions in
   `lib/permissions` (unit-tested), deriving relationships from the database — never from roles or
   ids sent by the browser.
3. **RLS** on every table. Server reads run as the user, so RLS also filters our own queries.
   Browsers hold the anon key but have **no write privileges** on any table.
4. **Database triggers/constraints** enforce status transitions, immutable estimates and approvals,
   append-only history/audit, and uniqueness rules.

Covered by automated tests: customer isolation, technician offer/assignment scoping, property
tenant/unit scoping, landlord single-booking access, household access, approval limits, invitation
single-use/revocation, admin-only data, and attempted direct writes (`tests/integration`).

## Data minimisation
- Exact addresses live in `booking_locations`, readable only by booking parties; technicians
  browsing offers see the locality only.
- Phone numbers live in `profile_contacts`, visible to the counterpart only while a job is active.
- Tenants never see other tenants; landlords see one booking; analytics carry no personal data.
- Ratings are aggregated and hidden below five reviews.

## Files
- Uploads are validated by **magic bytes** (JPEG/PNG/WebP, PDF for documents), max 5 MB each, max 4
  per upload, random storage keys.
- Files are served only via `/api/files/[id]`, which reads the attachment row as the user (RLS) and
  then streams the file (demo) or redirects to a 60-second signed URL (Supabase). The storage bucket
  is private and has no client policies.

## Secrets
- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` are server-only and must never be prefixed
  `NEXT_PUBLIC_`. Server modules import `server-only` to fail the build if bundled for the client.
- No secrets are committed; `.env.example` contains placeholders only.

## Abuse protection
- Per-IP/per-user fixed-window rate limits on booking creation, auth, complaints, uploads, coverage
  checks, analytics and general mutations (`lib/rate-limit.ts`). **In-memory** — replace the store with
  a shared one (e.g. Redis) before running multiple instances or serverless.
- Server Actions get Next.js's built-in Origin check (CSRF). Idempotency keys stop duplicate bookings.
- Redirects after sign-in accept only same-site relative paths.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive
  permissions policy, COOP.

## Invitations
Single-use 256-bit tokens; only a SHA-256 hash is stored; 7-day expiry; revocable; acceptance is
audited and notifies the inviter. Whoever holds an unexpired link can accept it — inviters should
share it privately. (When an email/SMS provider is added, bind invitations to a verified contact.)

## Known gaps before public launch
See `docs/launch-checklist.md` — notably a Content-Security-Policy with nonces, a shared rate-limit
store, a third-party security review/pen test, DPDP Act compliance review, and backup/restore drills.
