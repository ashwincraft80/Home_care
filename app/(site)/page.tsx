import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  House,
  KeyRound,
  MessageSquareWarning,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { getDb } from "@/lib/database";
import { listActiveCategories } from "@/features/catalog/service";
import { listCityCoverage } from "@/features/locations/service";
import { HomeExplorer } from "@/features/home-explorer/home-explorer";
import { CoverageChecker } from "@/components/domain/coverage-checker";
import { ServiceTile } from "@/components/domain/brand";
import { MobileBookBar } from "@/components/domain/site-chrome";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/surface";
import { getDictionary } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { appointmentWindows, cancellationPolicy, site } from "@/lib/config/site";
import { faqs } from "@/lib/content/faq";

function SectionHeading({ eyebrow, title, body, center }: { eyebrow?: string; title: string; body?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <p className="mb-2 text-sm font-bold tracking-wide text-brand">{eyebrow}</p>}
      <h2 className="font-display text-[30px] leading-[1.15] font-semibold text-ink sm:text-[38px]">{title}</h2>
      {body && <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">{body}</p>}
    </div>
  );
}

const statusLabel: Record<string, { label: string; tone: "success" | "info" | "neutral" | "warning" }> = {
  LIVE: { label: "Live", tone: "success" },
  PILOT: { label: "Pilot", tone: "info" },
  COMING_SOON: { label: "Coming later", tone: "neutral" },
  PAUSED: { label: "Paused", tone: "warning" },
};

export default async function HomePage() {
  const db = await getDb();
  const [dict, categories, cities] = await Promise.all([getDictionary(), listActiveCategories(db), listCityCoverage(db)]);
  const h = dict.home;

  return (
    <>
      {/* 2–6. Hero with the interactive home */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_20%,#f7e7c6_0%,transparent_60%)] opacity-70" aria-hidden />
        <div className="container-page relative grid items-center gap-10 pb-12 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:pb-20">
          <div className="max-w-xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-sm font-semibold text-brand-ink">
              <span className="size-1.5 rounded-full bg-sun" aria-hidden />
              {h.eyebrow}
            </p>
            <h1 className="font-display text-[42px] leading-[1.04] font-semibold text-ink sm:text-[56px] lg:text-[62px]">{h.title}</h1>
            <p className="mt-5 text-[18px] leading-relaxed text-ink-muted">{h.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className={buttonClass("primary", "lg")}>
                {h.primaryCta}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a href="#explore" className={buttonClass("secondary", "lg")}>
                {h.secondaryCta}
              </a>
            </div>
            <ul className="mt-8 grid gap-2.5 text-[15px] text-ink-muted sm:grid-cols-2">
              {[
                "Visit fee shown before you book",
                "Nothing extra without your approval",
                "Track every booking in one timeline",
                "A record of every repair and warranty",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <BadgeCheck className="size-[18px] shrink-0 text-brand" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-ink-subtle">{site.launch.pilotDescription}</p>
          </div>
          <HomeExplorer
            categories={categories.map((c) => ({
              slug: c.slug,
              name: c.name,
              visitFeePaise: c.visitFeePaise,
              indicativeMinPaise: c.indicativeMinPaise,
              indicativeMaxPaise: c.indicativeMaxPaise,
            }))}
            strings={{
              hint: h.explorerHint,
              reset: h.explorerReset,
              listLabel: h.explorerListLabel,
              loading: h.explorerLoading,
              fallback: h.explorerFallback,
              book: h.explorerBook,
              close: h.explorerClose,
            }}
          />
        </div>
      </section>

      {/* 7. Quick service categories */}
      <section className="container-page py-16" aria-labelledby="services-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div id="services-heading">
            <SectionHeading eyebrow="Services" title={h.servicesTitle} body={h.servicesSubtitle} />
          </div>
          <Link href="/services" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand hover:text-brand-hover">
            All services <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/services/${c.slug}`}
                className="group flex h-full flex-col rounded-[var(--radius-card)] glass glass-sheen glass-hover p-5"
              >
                <ServiceTile icon={c.icon} />
                <h3 className="mt-4 text-[17px] font-bold text-ink">{c.name}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-muted">{c.shortDescription}</p>
                <p className="mt-4 text-sm text-ink-muted">
                  Visit fee <span className="font-bold text-ink">{formatMoney(c.visitFeePaise)}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 8. How it works */}
      <section className="border-y border-white/70 bg-white/30 py-16" aria-labelledby="how-heading">
        <div className="container-page">
          <div id="how-heading">
            <SectionHeading eyebrow="How it works" title={h.howTitle} center />
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              { icon: CalendarClock, title: "Book", body: "Choose the service, describe the problem and pick a time window. You see the visit fee first." },
              { icon: ReceiptText, title: "Review the estimate", body: "After diagnosis you get an itemised estimate: labour, parts and any extras. You approve or decline." },
              { icon: Wrench, title: "Track the service", body: "One timeline shows who's assigned, when they set off, and what's been done." },
              { icon: ClipboardCheck, title: "Confirm completion", body: "You confirm the work is done before the invoice is issued — or raise an issue." },
            ].map((s, i) => (
              <li key={s.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-surface text-brand ring-1 ring-line">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-display text-sm font-semibold text-ink-subtle">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 9. Transparent pricing */}
      <section className="container-page grid items-center gap-12 py-20 lg:grid-cols-2" aria-labelledby="pricing-heading">
        <div id="pricing-heading">
          <SectionHeading
            eyebrow="Transparent pricing"
            title={h.pricingTitle}
            body="Every booking separates the visit fee, labour, parts and any optional extras. Indicative ranges are labelled as such; a confirmed quote only exists once you approve an itemised estimate."
          />
          <ul className="mt-6 space-y-3 text-[15px] text-ink-muted">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              No extra work or parts without your explicit approval — and the approved total can&apos;t be changed afterwards.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              Renting? Choose whether you or your landlord approves costs.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              {cancellationPolicy.summary}
            </li>
          </ul>
        </div>
        <figure className="rounded-[24px] border border-white/70 bg-white/60 p-6 shadow-[var(--shadow-architectural)] sm:p-8">
          <div className="flex items-center justify-between">
            <figcaption className="text-sm font-bold text-ink">Example estimate</figcaption>
            <Badge tone="neutral">Illustration only</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Kitchen tap leaking — diagnosis: worn cartridge</p>
          <dl className="mt-5 divide-y divide-line text-[15px]">
            {[
              ["Visit / inspection fee", "agreed at booking", "₹149"],
              ["Labour", "replace cartridge & hose", "₹250"],
              ["Parts", "cartridge ×1, hose ×1", "₹500"],
            ].map(([k, d, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-3">
                <dt>
                  <span className="font-semibold text-ink">{k}</span>
                  <span className="block text-sm text-ink-subtle">{d}</span>
                </dt>
                <dd className="font-semibold tabular-nums text-ink">{v}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between py-3">
              <dt className="font-bold text-ink">Estimated total</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums text-ink">₹899</dd>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <span className={buttonClass("primary", "md", "pointer-events-none")} aria-hidden>
              Approve
            </span>
            <span className={buttonClass("secondary", "md", "pointer-events-none")} aria-hidden>
              Decline
            </span>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">Real estimates are created by the assigned professional for your job. Numbers above are for illustration.</p>
        </figure>
      </section>

      {/* 10. Flexible scheduling */}
      <section className="border-y border-white/70 bg-white/30 py-20" aria-labelledby="schedule-heading">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="rounded-[24px] glass glass-sheen p-6">
              <p className="text-sm font-bold text-ink">Time windows</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {appointmentWindows.map((w) => (
                  <span key={w.key} className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-semibold text-ink tabular-nums">
                    {w.start}–{w.end}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                A window is only offered when a professional who does that service in your area has said they&apos;re available. Evening and weekend windows appear only where that&apos;s true.
              </p>
            </div>
          </div>
          <div id="schedule-heading" className="order-1 lg:order-2">
            <SectionHeading
              eyebrow="Fits your schedule"
              title="Book around work, not the other way round."
              body="Pick a two-hour window, reschedule or cancel from the app, and share the booking with your partner or family so whoever is home knows what to expect."
            />
            <ul className="mt-6 space-y-2.5 text-[15px] text-ink-muted">
              {["Reschedule requests and cancellations in two taps", "Household sharing: partners can follow or manage bookings", "In-app updates at every step, in one timeline", "“Book again” for repeat jobs in seconds"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <BadgeCheck className="size-[18px] shrink-0 text-brand" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 11. Passport preview */}
      <section className="container-page grid items-center gap-12 py-20 lg:grid-cols-2" aria-labelledby="passport-heading">
        <div id="passport-heading">
          <SectionHeading
            eyebrow="Home maintenance passport"
            title={h.passportTitle}
            body="Every completed job becomes a record: what was done, by whom, what it cost, and the workmanship warranty. Add your appliances, warranty documents and past services — reminders follow general service guidance, never invented manufacturer claims."
          />
          <Link href="/my-home" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand hover:text-brand-hover">
            How the passport works <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <figure className="rounded-[24px] border border-white/70 bg-white/60 p-6 shadow-[var(--shadow-architectural)]">
          <div className="flex items-center justify-between">
            <figcaption className="text-sm font-bold text-ink">Bedroom AC</figcaption>
            <Badge tone="neutral">Example</Badge>
          </div>
          <p className="text-sm text-ink-muted">1.5 ton split · installed Mar 2024 · brand warranty until Dec 2027</p>
          <ol className="mt-5 space-y-4 border-l border-line pl-5">
            {[
              ["Service & drain cleaning", "HomeCare job · 30-day workmanship warranty", "Sep"],
              ["Filter cleaned", "Added by you", "Mar"],
            ].map(([t, d, m]) => (
              <li key={t} className="relative">
                <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-surface bg-brand" aria-hidden />
                <p className="font-semibold text-ink">{t}</p>
                <p className="text-sm text-ink-muted">
                  {d} · {m}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-lg bg-sun-soft px-3 py-2 text-sm text-[#7a4705]">Suggested next service: before summer (HomeCare guidance — follow your manual if it differs).</div>
        </figure>
      </section>

      {/* 12. Use cases */}
      <section className="border-y border-white/70 bg-white/30 py-20" aria-labelledby="who-heading">
        <div className="container-page">
          <div id="who-heading">
            <SectionHeading eyebrow="Made for real households" title="Whoever you are at home, it works the same way." center />
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: Briefcase, title: "Working professionals", body: "Choose a window that fits, share it with your partner, and approve estimates from your phone.", href: "/book" },
              { icon: KeyRound, title: "Tenants", body: "Request a repair without owning the home. Your landlord can approve the cost with a secure link.", href: "/for-renters" },
              { icon: GraduationCap, title: "Students in shared flats", body: "Book for the flat, see who approves the cost, and keep the invoice as proof.", href: "/for-renters" },
              { icon: House, title: "Homeowners", body: "Keep your appliances, warranties and every repair in one passport, with service reminders.", href: "/my-home" },
              { icon: UsersRound, title: "Landlords & managers", body: "Manage units, set approval limits, and see every request and invoice by property.", href: "/for-property-managers" },
            ].map((u) => (
              <li key={u.title}>
                <Link href={u.href} className="flex h-full flex-col rounded-[var(--radius-card)] glass glass-sheen glass-hover p-5">
                  <u.icon className="size-6 text-brand" aria-hidden strokeWidth={1.75} />
                  <h3 className="mt-4 font-bold text-ink">{u.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{u.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 13. Trust & accountability (14. Testimonials intentionally omitted until genuine reviews exist) */}
      <section className="container-page py-20" aria-labelledby="trust-heading">
        <div id="trust-heading">
          <SectionHeading
            eyebrow="Trust & accountability"
            title="Promises we can actually keep."
            body="We don't publish ratings, reviews or numbers we can't stand behind. Here's what every booking includes."
          />
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ClipboardCheck, title: "A full job history", body: "Status, assigned professional, diagnosis, estimate, approval and completion are all recorded." },
            { icon: FileCheck2, title: "Workmanship warranty", body: "Each service has a stated warranty period and exclusions. It is not a blanket guarantee." },
            { icon: MessageSquareWarning, title: "A real complaint path", body: "Raise an issue on any job, track its status, and escalate if it isn't resolved." },
            { icon: UsersRound, title: "Fair to professionals", body: "They see the job, area and earnings before accepting. Payouts are itemised; no hidden cuts." },
          ].map((t) => (
            <li key={t.title} className="rounded-[var(--radius-card)] glass glass-sheen p-5">
              <t.icon className="size-6 text-brand" aria-hidden strokeWidth={1.75} />
              <h3 className="mt-4 font-bold text-ink">{t.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{t.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-subtle">
          Customer reviews will appear here only after they come from verified, completed bookings.{" "}
          <Link href="/trust-and-safety" className="font-semibold text-brand hover:underline">
            Read our trust & safety approach
          </Link>
        </p>
      </section>

      {/* 15. Coverage & city selector */}
      <section className="border-y border-white/70 bg-white/30 py-20" aria-labelledby="coverage-heading">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div id="coverage-heading">
            <SectionHeading
              eyebrow="Where we serve"
              title="Check if we serve your home."
              body="We're starting small on purpose: a few neighbourhoods with enough reliable professionals to keep our promises. More areas open as we earn it."
            />
            <div className="mt-6 max-w-md">
              <CoverageChecker />
            </div>
          </div>
          <ul className="grid content-start gap-3">
            {cities.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-card)] glass glass-sheen p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-ink">
                    {c.name} <span className="font-normal text-ink-subtle">· {c.state}</span>
                  </h3>
                  <Badge tone={statusLabel[c.status]?.tone ?? "neutral"}>{statusLabel[c.status]?.label ?? c.status}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-ink-muted">
                  {c.liveAreas.length > 0 && ["LIVE", "PILOT"].includes(c.status) ? (
                    <>Open for bookings: {c.liveAreas.join(", ")}.</>
                  ) : (
                    <>Not taking bookings yet.</>
                  )}
                  {c.plannedAreas.length > 0 && <> Planned: {c.plannedAreas.join(", ")}.</>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 16. FAQ */}
      <section className="container-page py-20" aria-labelledby="faq-heading">
        <div id="faq-heading">
          <SectionHeading eyebrow="FAQ" title="Questions people ask first" center />
        </div>
        <div className="mx-auto mt-10 max-w-3xl divide-y divide-line rounded-[var(--radius-card)] glass glass-sheen">
          {faqs.slice(0, 6).map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-ink">
                {f.q}
                <span aria-hidden className="text-xl text-ink-subtle transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center">
          <Link href="/faq" className="font-semibold text-brand hover:underline">
            See all questions
          </Link>
        </p>
      </section>

      <div className="h-20 sm:hidden" aria-hidden />
      <MobileBookBar label={h.primaryCta} />
    </>
  );
}
