import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listComplaintsAdmin } from "@/features/complaints/service";
import { complaintCategoryText, complaintStatusTone } from "@/features/complaints/components/complaint-thread";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Complaints" };

export default async function AdminComplaints({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const actor = await requireActor("ADMIN");
  const items = await listComplaintsAdmin(await getDb(), actor, status);
  return (
    <>
      <PageHeader title="Complaints" description="Urgent and high-priority first. Resolve with a written resolution the raiser can see." />
      <div className="mb-5 flex flex-wrap gap-2">
        {["ALL", "OPEN", "IN_REVIEW", "ESCALATED", "RESOLVED", "CLOSED"].map((s) => (
          <Link key={s} href={s === "ALL" ? "/admin/complaints" : `/admin/complaints?status=${s}`} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", (status ?? "ALL") === s ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted")}>
            {s.replace("_", " ").toLowerCase()}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <IllustratedEmpty scene="notifications" title="No complaints here" body="Nothing in this view." />
      ) : (
        <Card className="divide-y divide-line">
          {items.map((c) => (
            <Link key={c.id} href={`/admin/complaints/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-muted">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{c.reference}</p>
                  <Badge tone={complaintStatusTone[c.status]}>{c.status.replace("_", " ").toLowerCase()}</Badge>
                  {c.priority !== "NORMAL" && <Badge tone="danger">{c.priority.toLowerCase()}</Badge>}
                </div>
                <p className="text-sm text-ink-muted">
                  {complaintCategoryText[c.category]} · {c.raisedByName} ({c.raisedByRole.toLowerCase()}) {c.bookingReference ? `· ${c.bookingReference}` : ""} · {fmt.dateTime(c.createdAt)}
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
