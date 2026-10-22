import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listMaintenanceRecords, listMyAssets, nextServiceSuggestion } from "@/features/assets/service";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { assetTypeLabels } from "@/lib/config/catalog";
import { formatMoney } from "@/lib/money";
import { fmt, localDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Home passport" };

export default async function AssetsPage() {
  const actor = await requireActor();
  const db = await getDb();
  const [assets, records] = await Promise.all([listMyAssets(db, actor), listMaintenanceRecords(db, actor)]);
  const today = localDateKey(new Date());
  return (
    <>
      <PageHeader
        title="Home maintenance passport"
        description="Your appliances, warranties and every repair in one place. Reminders use HomeCare's general service guidance — not manufacturer claims."
        actions={
          <Link href="/account/assets/new" className={buttonClass("primary", "md")}>
            <Plus className="size-4" aria-hidden /> Add appliance
          </Link>
        }
      />
      {assets.length === 0 ? (
        <IllustratedEmpty scene="assets" title="No appliances yet" body="Add the things you'd want serviced — AC, geyser, RO, inverter or solar. Only a name and type are needed." action={{ href: "/account/assets/new", label: "Add your first appliance" }} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {assets.map((a) => {
            const s = nextServiceSuggestion(a, today);
            const warrantyActive = a.warrantyExpiresOn && a.warrantyExpiresOn >= today;
            return (
              <li key={a.id}>
                <Link href={`/account/assets/${a.id}`} className="block h-full rounded-[var(--radius-card)] glass glass-sheen glass-hover p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold tracking-wide text-ink-subtle uppercase">{assetTypeLabels[a.assetType]}</p>
                      <p className="mt-0.5 text-lg font-bold text-ink">{a.nickname}</p>
                      <p className="text-sm text-ink-muted">{[a.brand, a.model, a.locationInHome].filter(Boolean).join(" · ") || "No details added"}</p>
                    </div>
                    {warrantyActive && <Badge tone="success">Under warranty</Badge>}
                  </div>
                  <div className="mt-4 grid gap-1 text-sm text-ink-muted">
                    <p>
                      Last service: <span className="font-semibold text-ink">{a.lastServicedOn ? fmt.date(a.lastServicedOn) : "No record yet"}</span> · {a.recordCount} record(s)
                    </p>
                    {s.nextServiceOn && (
                      <p className={s.overdue ? "font-semibold text-warning" : ""}>
                        Suggested next service: {fmt.date(s.nextServiceOn)}
                        {s.overdue ? " (due)" : ""}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-10 space-y-3" aria-labelledby="hist">
        <h2 id="hist" className="text-lg font-bold">
          Maintenance history
        </h2>
        {records.length === 0 ? (
          <IllustratedEmpty scene="history" title="No maintenance history yet" body="Completed HomeCare jobs are added automatically. You can also record past services yourself." />
        ) : (
          <Card className="divide-y divide-line">
            {records.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{r.title}</p>
                  <p className="text-sm text-ink-muted">
                    {fmt.date(r.performedOn)} · {r.assetNickname ?? "Home"} · {r.source === "JOB" ? "HomeCare job" : "Added by you"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.costPaise != null && <span className="text-sm font-semibold tabular-nums">{formatMoney(r.costPaise)}</span>}
                  {r.bookingId && (
                    <Link href={`/account/bookings/${r.bookingId}`} className="text-sm font-semibold text-brand hover:underline">
                      View job
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
