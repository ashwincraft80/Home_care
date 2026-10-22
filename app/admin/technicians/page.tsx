import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listTechnicians } from "@/features/admin/service";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Professionals" };
const tone = { APPROVED: "success", PENDING_REVIEW: "info", SUSPENDED: "danger", REJECTED: "neutral" } as const;

export default async function AdminTechnicians({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const actor = await requireActor("ADMIN");
  const techs = await listTechnicians(await getDb(), actor, status);
  return (
    <>
      <PageHeader title="Professionals" description="Review profiles, capabilities and coverage. Approval means operations reviewed the profile — not a third-party background check." />
      <div className="mb-5 flex flex-wrap gap-2">
        {["ALL", "PENDING_REVIEW", "APPROVED", "SUSPENDED", "REJECTED"].map((s) => (
          <Link
            key={s}
            href={s === "ALL" ? "/admin/technicians" : `/admin/technicians?status=${s}`}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", (status ?? "ALL") === s ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted")}
          >
            {s.replace("_", " ").toLowerCase()}
          </Link>
        ))}
      </div>
      {techs.length === 0 ? (
        <IllustratedEmpty scene="technicians" title="No professionals in this view" body="New professionals sign up from the For professionals page." />
      ) : (
        <Card className="divide-y divide-line">
          {techs.map((t) => (
            <Link key={t.profileId} href={`/admin/technicians/${t.profileId}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-muted">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{t.name}</p>
                  <Badge tone={tone[t.verificationStatus]}>{t.verificationStatus.replace("_", " ").toLowerCase()}</Badge>
                  {t.openComplaints > 0 && <Badge tone="danger">{t.openComplaints} open complaint(s)</Badge>}
                </div>
                <p className="truncate text-sm text-ink-muted">
                  {t.categories.join(", ") || "No services"} · {t.localities.join(", ") || "No areas"}
                </p>
                <p className="text-sm text-ink-subtle">
                  {t.activeJobs} active · {t.completedJobs} completed · {t.yearsExperience ?? "?"} yrs
                </p>
              </div>
              <ChevronRight className="size-5 text-ink-subtle" aria-hidden />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
