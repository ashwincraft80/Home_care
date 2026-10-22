import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getComplaint } from "@/features/complaints/service";
import { ComplaintThread } from "@/features/complaints/components/complaint-thread";
import { Alert, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Issue" };

export default async function ComplaintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const actor = await requireActor();
  const c = await getComplaint(await getDb(), actor, id);
  if (!c) notFound();
  return (
    <>
      <Link href="/support" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Support centre
      </Link>
      <PageHeader title={`Issue ${c.reference}`} />
      {created === "1" && (
        <Alert tone="success" className="mb-6">
          We&apos;ve received your issue. Operations will reply here.
        </Alert>
      )}
      <ComplaintThread c={c} admin={false} />
    </>
  );
}
