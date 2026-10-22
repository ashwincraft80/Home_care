import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getOperationalMetrics } from "@/features/admin/service";
import { listCityCoverage } from "@/features/locations/service";
import { Alert, Card, PageHeader } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Metrics" };

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const [{ metrics, windowDays, minimumSample, citySpecific }, cities] = await Promise.all([getOperationalMetrics(db, actor, undefined, city ?? null), listCityCoverage(db)]);
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-sm font-semibold", active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted");
  return (
    <>
      <PageHeader title="Operational metrics" description={`Calculated from real bookings and events in the last ${windowDays} days (repeat rate: all time). Nothing here is estimated or hard-coded.`} />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/metrics" className={chip(!city)}>
          All cities
        </Link>
        {cities.map((c) => (
          <Link key={c.id} href={`/admin/metrics?city=${c.id}`} className={chip(city === c.id)}>
            {c.name}
          </Link>
        ))}
      </div>
      <Alert tone="info" className="mb-6">
        A metric shows “Not enough data” until it has at least {minimumSample} observations. Treat small samples as directional only.
        {citySpecific && " Conversion isn't available per city because booking starts are anonymous."}
      </Alert>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.key} className="p-5">
            <p className="text-sm font-semibold text-ink-muted">{m.label}</p>
            <p className={`mt-2 font-display text-[34px] leading-none font-semibold tabular-nums ${m.sufficient ? "text-ink" : "text-ink-subtle"}`}>
              {m.value == null ? "—" : m.unit === "ratio" ? `${Math.round(m.value * 1000) / 10}%` : `${Math.round(m.value * 10) / 10} h`}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {m.sufficient ? (m.unit === "ratio" ? `${m.numerator} of ${m.denominator}` : `${m.numerator} bookings`) : `Not enough data (n = ${m.denominator})`}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{m.definition}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
