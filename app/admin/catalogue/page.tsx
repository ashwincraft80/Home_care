import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listAllCategoriesForAdmin } from "@/features/catalog/service";
import { updateCategoryAction } from "@/features/admin/actions";
import { ServiceTile } from "@/components/domain/brand";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, PageHeader } from "@/components/ui/surface";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Services & pricing" };
const rupees = (p: number | null) => (p == null ? "" : String(p / 100));

export default async function CataloguePage() {
  const actor = await requireActor("ADMIN");
  const cats = await listAllCategoriesForAdmin(await getDb(), actor.userId);
  return (
    <>
      <PageHeader title="Services & indicative pricing" description="Changes apply to new bookings only. Every change is audited with before/after values." />
      <Alert tone="warning" className="mb-6">
        Indicative ranges are shown to customers as “typical, not a quote”. Keep them grounded in real completed jobs — the seeded values are placeholders for review.
      </Alert>
      <div className="space-y-4">
        {cats.map((c) => (
          <Card key={c.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-4 px-5 py-4">
                <ServiceTile icon={c.icon} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{c.name}</span>
                  <span className="text-sm text-ink-muted">
                    Visit {formatMoney(c.visitFeePaise)} · typical {c.indicativeMinPaise != null ? formatMoney(c.indicativeMinPaise) : "—"}–{c.indicativeMaxPaise != null ? formatMoney(c.indicativeMaxPaise) : "—"} · warranty {c.warrantyDays}d
                  </span>
                </span>
                <Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Active" : "Hidden"}</Badge>
              </summary>
              <CardBody className="border-t border-line">
                <ActionForm action={updateCategoryAction as never}>
                  <input type="hidden" name="categoryId" value={c.id} />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Visit fee (₹)" htmlFor={`vf-${c.id}`}>
                      <Input id={`vf-${c.id}`} name="visitFee" inputMode="decimal" defaultValue={rupees(c.visitFeePaise)} required />
                    </Field>
                    <Field label="Typical min (₹)" htmlFor={`mn-${c.id}`}>
                      <Input id={`mn-${c.id}`} name="indicativeMin" inputMode="decimal" defaultValue={rupees(c.indicativeMinPaise)} />
                    </Field>
                    <Field label="Typical max (₹)" htmlFor={`mx-${c.id}`}>
                      <Input id={`mx-${c.id}`} name="indicativeMax" inputMode="decimal" defaultValue={rupees(c.indicativeMaxPaise)} />
                    </Field>
                    <Field label="Warranty days" htmlFor={`wd-${c.id}`}>
                      <Input id={`wd-${c.id}`} name="warrantyDays" inputMode="numeric" defaultValue={String(c.warrantyDays)} required />
                    </Field>
                  </div>
                  <Field label="Short description" htmlFor={`sd-${c.id}`}>
                    <Input id={`sd-${c.id}`} name="shortDescription" defaultValue={c.shortDescription} required />
                  </Field>
                  <Field label="Warranty exclusions" htmlFor={`we-${c.id}`}>
                    <Textarea id={`we-${c.id}`} name="warrantyExclusions" rows={2} defaultValue={c.warrantyExclusions} />
                  </Field>
                  <Checkbox name="isActive" defaultChecked={c.isActive} label="Show this service to customers" />
                  <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                </ActionForm>
              </CardBody>
            </details>
          </Card>
        ))}
      </div>
    </>
  );
}
