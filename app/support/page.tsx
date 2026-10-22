import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listMyComplaints } from "@/features/complaints/service";
import { complaintCategoryText, complaintStatusTone } from "@/features/complaints/components/complaint-thread";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { site } from "@/lib/config/site";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const actor = await requireActor();
  const items = await listMyComplaints(await getDb(), actor);
  return (
    <>
      <PageHeader
        title="Support centre"
        description="Raise an issue about a booking, a payout or anything else, and track it to resolution."
        actions={
          <Link href="/support/new" className={buttonClass("primary", "md")}>
            Raise an issue
          </Link>
        }
      />
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4 text-sm text-ink-muted">
        <Phone className="size-4 text-brand" aria-hidden /> Urgent safety issue? Call {site.contact.supportPhone} ({site.contact.supportHours}).
      </Card>
      {items.length === 0 ? (
        <IllustratedEmpty scene="notifications" title="No issues raised" body="If something goes wrong with a booking, raise it here. You'll see every update from our team." action={{ href: "/support/new", label: "Raise an issue" }} />
      ) : (
        <Card className="divide-y divide-line">
          {items.map((c) => (
            <Link key={c.id} href={`/support/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-muted">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">
                  {c.reference} · {complaintCategoryText[c.category]}
                </p>
                <p className="text-sm text-ink-muted">
                  {c.bookingReference ? `${c.bookingReference} · ` : ""}Updated {fmt.dateTime(c.updatedAt)}
                </p>
              </div>
              <Badge tone={complaintStatusTone[c.status]}>{c.status.replace("_", " ").toLowerCase()}</Badge>
              <ChevronRight className="size-5 text-ink-subtle" aria-hidden />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
