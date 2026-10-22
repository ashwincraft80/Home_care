import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getComplaint } from "@/features/complaints/service";
import { ComplaintThread } from "@/features/complaints/components/complaint-thread";
import { PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Complaint" };

export default async function AdminComplaint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("ADMIN");
  const c = await getComplaint(await getDb(), actor, id);
  if (!c) notFound();
  return (
    <>
      <Link href="/admin/complaints" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Complaints
      </Link>
      <PageHeader
        title={`Complaint ${c.reference}`}
        actions={
          c.bookingId && (
            <Link href={`/admin/bookings/${c.bookingId}`} className="text-sm font-semibold text-brand hover:underline">
              Open booking {c.bookingReference}
            </Link>
          )
        }
      />
      <ComplaintThread c={c} admin />
    </>
  );
}
