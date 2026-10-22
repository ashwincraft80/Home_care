import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getTechnicianProfile } from "@/features/technicians/service";
import { listActiveCategories } from "@/features/catalog/service";
import { listLiveAreas } from "@/features/locations/service";
import { auditTrailFor } from "@/features/admin/service";
import { reviewTechnicianAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Professional" };
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function AdminTechnician({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const p = await getTechnicianProfile(db, actor, id);
  if (!p) notFound();
  const [cats, areas, audit] = await Promise.all([listActiveCategories(db), listLiveAreas(db), auditTrailFor(db, actor, id)]);
  return (
    <>
      <Link href="/admin/technicians" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Professionals
      </Link>
      <PageHeader title={p.name} actions={<Badge tone={p.verificationStatus === "APPROVED" ? "success" : "info"}>{p.verificationStatus.replace("_", " ").toLowerCase()}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="py-2">
            <DescriptionList
              items={[
                { label: "Phone", value: p.phone ?? "—" },
                { label: "Experience", value: `${p.yearsExperience ?? 0} years` },
                { label: "Bio", value: p.bio || "—" },
                { label: "Services", value: cats.filter((c) => p.categoryIds.includes(c.id)).map((c) => c.name).join(", ") || "—" },
                { label: "Areas", value: areas.filter((a) => p.serviceAreaIds.includes(a.id)).map((a) => a.name).join(", ") || "—" },
                {
                  label: "Availability",
                  value: p.availability.length
                    ? days
                        .map((d, i) => {
                          const w = p.availability.filter((a) => a.startsWith(`${i}:`)).map((a) => a.slice(2));
                          return w.length ? `${d} ${w.join(", ")}` : null;
                        })
                        .filter(Boolean)
                        .join(" · ")
                    : "Not set",
                },
                { label: "Last review", value: p.reviewNotes ?? "—" },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Review" description="The professional sees your note." />
            <CardBody>
              <ActionForm action={reviewTechnicianAction as never}>
                <input type="hidden" name="technicianId" value={p.profileId} />
                <Field label="Decision" htmlFor="status">
                  <Select id="status" name="status" defaultValue={p.verificationStatus}>
                    <option value="APPROVED">Approve</option>
                    <option value="PENDING_REVIEW">Needs more information</option>
                    <option value="SUSPENDED">Suspend</option>
                    <option value="REJECTED">Reject</option>
                  </Select>
                </Field>
                <Field label="What did you check / why?" htmlFor="notes">
                  <Textarea id="notes" name="notes" rows={3} required minLength={5} />
                </Field>
                <SubmitButton pendingLabel="Saving…">Save review</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" />
            <CardBody className="space-y-2 text-sm">
              {audit.length === 0 ? (
                <p className="text-ink-muted">No changes recorded.</p>
              ) : (
                audit.map((a) => (
                  <p key={a.id}>
                    <span className="text-ink-subtle">{fmt.dateTime(a.createdAt)}</span> · {a.action} · {a.actorName ?? "System"}
                  </p>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
