# Launch checklist

Status key: ✅ done in V1 · ⏳ needs work · 🔑 needs credentials/contracts · ⚖️ needs legal/finance review

## Product & operations
- ⏳ Replace placeholder contact details in `lib/config/site.ts` (support phone/email, registered address).
- ⏳ Verify pilot pincodes, area statuses and per-area services in Admin → Cities & areas.
- ⏳ Review every visit fee, indicative range, warranty period and exclusion in Admin → Services & pricing using real job data.
- ⏳ Onboard and review the first professionals; confirm their availability covers the windows you want to offer.
- ⏳ Decide the operations rota for confirming requests and handling disputes within stated times.
- ⏳ Write standard responses for complaints, warranty claims and payout disputes.
- ⏳ Native-speaker review of Hindi strings; decide whether policy pages need Hindi versions.
- ✅ Booking, assignment, estimates, approvals (customer/household/landlord/property), completion, invoices, passport, complaints, payouts, metrics.

## Legal, finance, compliance ⚖️
- Terms of service, privacy policy and cancellation policy are **drafts** — lawyer review required.
- DPDP Act 2023: consent records, data-retention periods, deletion workflow (requests are captured; processing is manual today).
- GST treatment of visit fees, labour, parts; invoice format and numbering compliance.
- Professional engagement model (independent contractor terms), payouts, TDS, insurance.
- Consumer protection / e-commerce rules for service marketplaces.

## Integrations 🔑
- SMS/OTP, email and WhatsApp Business providers (interfaces in `lib/integrations`; none connected).
- Payment gateway — start in **sandbox**; never enable live payments without review. Never mark payment as succeeded without provider confirmation (webhook).
- Maps/geocoding for address autocomplete (pincode coverage works without it).
- Third-party ID/background verification for professionals, if you want to claim it.
- Analytics provider (implement an `AnalyticsSink`; keep the PII allow-list).

## Engineering
- 🔑 Create the Supabase project; set env vars from `.env.example`; run `npm run db:migrate` (or `supabase db push`) and `npm run db:seed:catalog`; grant the first admin with `npm run db:grant-admin -- <email>`.
- ⏳ Configure Supabase Auth: site URL, redirect URL `https://<domain>/auth/callback`, email templates, password policy, leaked-password protection, rate limits.
- ⏳ Shared rate-limit store for multi-instance deployments.
- ⏳ Content-Security-Policy with nonces; verify with the Next.js CSP guide.
- ⏳ Error monitoring and structured logging (no personal data in logs).
- ⏳ Backups and a tested restore; point-in-time recovery on Supabase.
- ⏳ Load test booking creation and slot availability for the pilot volume.
- ⏳ Accessibility audit with a screen reader on mobile; colour-contrast check of glass surfaces on real devices.
- ⏳ Performance budget on low-end Android (3D falls back automatically; verify the threshold feels right).
- ⏳ Independent security review / pen test before handling real customer data at scale.
- ✅ Type check, lint, unit + integration tests (PGlite with real RLS), production build, Playwright e2e.

## Measurement
- ✅ Events: service viewed/selected, explorer opened, booking started/submitted/failed/cancelled, technician assigned, estimate submitted/approved/rejected, job completed, complaint created, repeat booking, unavailable area.
- ⏳ Define pilot success thresholds for the hypotheses in `docs/research-to-product.md` **before** looking at results.
