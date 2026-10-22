import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, ShieldCheck } from "lucide-react";
import { getDb } from "@/lib/database";
import { getCategoryBySlug } from "@/features/catalog/service";
import { ServiceTile } from "@/components/domain/brand";
import { MobileBookBar } from "@/components/domain/site-chrome";
import { TrackEvent } from "@/components/domain/track-event";
import { CoverageChecker } from "@/components/domain/coverage-checker";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { cancellationPolicy } from "@/lib/config/site";
import { formatMoney, formatMoneyRange } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCategoryBySlug(await getDb(), slug);
  return c ? { title: c.name, description: c.shortDescription } : { title: "Service" };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCategoryBySlug(await getDb(), slug);
  if (!c) notFound();
  const range = formatMoneyRange(c.indicativeMinPaise, c.indicativeMaxPaise);
  return (
    <div className="container-page py-12 sm:py-16">
      <TrackEvent name="service_viewed" props={{ category: c.slug }} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <ServiceTile icon={c.icon} size="lg" />
          <h1 className="mt-5 font-display text-[40px] leading-tight font-semibold text-ink sm:text-[48px]">{c.name}</h1>
          <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-ink-muted">{c.description}</p>
          <h2 className="mt-10 text-lg font-bold text-ink">Common requests</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {c.commonJobs.map((j) => (
              <li key={j}>
                <Link href={`/book?category=${c.slug}&issue=${encodeURIComponent(j)}`} className="flex items-center justify-between rounded-xl border border-white/70 bg-white/60 px-4 py-3 font-semibold text-ink hover:border-brand">
                  {j} <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mt-10 text-lg font-bold text-ink">How the visit works</h2>
          <ol className="mt-3 space-y-3 text-[15px] text-ink-muted">
            {[
              `You pay the ${formatMoney(c.visitFeePaise)} visit fee for inspection and diagnosis.`,
              "If more work or parts are needed, you get an itemised estimate: labour, parts and any extras.",
              "You approve or decline. Nothing extra is done without approval, and the approved total can't change.",
              "You confirm the work is done; your invoice and warranty are recorded in your home passport.",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sage-soft text-sm font-bold text-brand-ink">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <aside className="space-y-4">
          <Card className="p-6">
            <p className="text-sm text-ink-muted">Visit / inspection fee</p>
            <p className="font-display text-4xl font-semibold">{formatMoney(c.visitFeePaise)}</p>
            {range && (
              <p className="mt-2 text-sm text-ink-muted">
                Typical total for common jobs: <strong className="text-ink">{range}</strong>. Indicative only — not a quote.
              </p>
            )}
            <Link href={`/book?category=${c.slug}`} className={buttonClass("primary", "lg", "mt-5 w-full")}>
              Book {c.name.toLowerCase()}
            </Link>
            <ul className="mt-5 space-y-2 text-sm text-ink-muted">
              <li className="flex gap-2">
                <BadgeCheck className="size-4 shrink-0 text-brand" aria-hidden /> Pay after the service (UPI or cash)
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden /> {c.warrantyDays > 0 ? `${c.warrantyDays}-day workmanship warranty` : "No workmanship warranty for this service"}
              </li>
            </ul>
            {c.warrantyExclusions && <p className="mt-3 text-xs text-ink-subtle">Warranty exclusions: {c.warrantyExclusions}</p>}
            <p className="mt-3 text-xs text-ink-subtle">{cancellationPolicy.summary}</p>
          </Card>
          <Card className="p-6">
            <p className="mb-3 font-semibold text-ink">Do we serve your home?</p>
            <CoverageChecker compact />
          </Card>
        </aside>
      </div>
      <div className="h-20 sm:hidden" aria-hidden />
      <MobileBookBar label={`Book ${c.name.toLowerCase()}`} />
    </div>
  );
}
