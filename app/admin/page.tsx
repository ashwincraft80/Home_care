import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { cityBookingCounts, queueCounts } from "@/features/admin/service";
import { integrationStatus } from "@/lib/integrations";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { isDemoMode } from "@/lib/config/env";

export const metadata: Metadata = { title: "Operations" };

const stateTone = { configured: "success", simulated: "info", not_configured: "neutral" } as const;
const stateText = { configured: "Configured", simulated: "Simulated (demo)", not_configured: "Not configured" } as const;

export default async function AdminHome() {
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const [q, cities] = await Promise.all([queueCounts(db, actor), cityBookingCounts(db, actor)]);
  const tiles = [
    ["New requests to confirm", q?.requested ?? 0, "/admin/bookings?status=REQUESTED"],
    ["Confirmed, no professional", q?.unassigned ?? 0, "/admin/bookings?unassigned=1"],
    ["Reschedule requests", q?.reschedule ?? 0, "/admin/bookings?status=RESCHEDULE_REQUESTED"],
    ["Disputes", q?.disputed ?? 0, "/admin/bookings?status=DISPUTED"],
    ["Awaiting customer confirmation", q?.awaitingClose ?? 0, "/admin/bookings?status=COMPLETION_PENDING"],
    ["Open complaints", q?.openComplaints ?? 0, "/admin/complaints"],
    ["Profiles to review", q?.pendingTechs ?? 0, "/admin/technicians?status=PENDING_REVIEW"],
  ] as const;
  return (
    <>
      <PageHeader title="Operations" description="What needs attention now. Every action here is permission-checked on the server and written to the audit log." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href} className="rounded-[var(--radius-card)] glass glass-sheen glass-hover p-5">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${n > 0 ? "text-ink" : "text-ink-subtle"}`}>{n}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bookings by city" description="All-time counts from real bookings." />
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-2 font-semibold">City</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 text-right font-semibold">Open</th>
                  <th className="pb-2 text-right font-semibold">Completed</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.cityId} className="border-t border-line">
                    <td className="py-2 font-semibold">
                      <Link href={`/admin/metrics?city=${c.cityId}`} className="hover:underline">
                        {c.cityName}
                      </Link>
                    </td>
                    <td className="py-2">
                      <Badge tone={c.status === "LIVE" ? "success" : c.status === "PILOT" ? "info" : "neutral"}>{c.status.replace("_", " ").toLowerCase()}</Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums">{c.open}</td>
                    <td className="py-2 text-right tabular-nums">{c.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Integrations" description={isDemoMode() ? "Demo mode: nothing is sent to real people." : "What is actually connected."} />
          <CardBody className="space-y-2">
            {integrationStatus().map((i) => (
              <div key={i.key} className="flex items-center justify-between text-sm">
                <span>{i.label}</span>
                <Badge tone={stateTone[i.state]}>{stateText[i.state]}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
