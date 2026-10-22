import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getCoverageAdmin } from "@/features/locations/service";
import { listAllCategoriesForAdmin } from "@/features/catalog/service";
import { saveAreaAction, updateCityAction } from "@/features/admin/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Cities & areas" };

function AreaForm({ cityId, area, categories }: { cityId: string; area?: { id: string; name: string; status: string; pincodes: string[]; categoryIds: string[] }; categories: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveAreaAction as never}>
      {area && <input type="hidden" name="areaId" value={area.id} />}
      <input type="hidden" name="cityId" value={cityId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Area name" htmlFor={`an-${area?.id ?? cityId}`}>
          <Input id={`an-${area?.id ?? cityId}`} name="name" defaultValue={area?.name} required />
        </Field>
        <Field label="Status" htmlFor={`as-${area?.id ?? cityId}`}>
          <Select id={`as-${area?.id ?? cityId}`} name="status" defaultValue={area?.status ?? "PLANNED"}>
            <option value="LIVE">Live — taking bookings</option>
            <option value="PAUSED">Paused</option>
            <option value="PLANNED">Planned (waitlist only)</option>
          </Select>
        </Field>
      </div>
      <Field label="Pincodes" htmlFor={`ap-${area?.id ?? cityId}`} hint="Comma or space separated. Each pincode can belong to one area.">
        <Textarea id={`ap-${area?.id ?? cityId}`} name="pincodes" rows={2} defaultValue={area?.pincodes.join(", ")} />
      </Field>
      <fieldset>
        <legend className="text-sm font-semibold">Services offered here</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={area?.categoryIds.includes(c.id)} className="size-4 accent-brand" /> {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
        {area ? "Save area" : "Add area"}
      </SubmitButton>
    </ActionForm>
  );
}

export default async function CoveragePage() {
  const actor = await requireActor("ADMIN");
  const db = await getDb();
  const [{ cities, areas, unmatchedWaitlist }, categories] = await Promise.all([getCoverageAdmin(db, actor), listAllCategoriesForAdmin(db, actor.userId)]);
  return (
    <>
      <PageHeader title="Cities & service areas" description="Only LIVE areas in LIVE or PILOT cities accept bookings, and only for the services enabled there. Time windows also need an available professional." />
      <Alert tone="info" className="mb-6">
        Launch narrowly: validate one concentrated area with reliable professionals, then open the next. Waitlist counts below show real demand from people who checked their pincode.
      </Alert>
      <div className="space-y-6">
        {cities.map((c) => (
          <Card key={c.id}>
            <CardHeader
              title={`${c.name}, ${c.state}`}
              description={`${c.waitlist} waitlist sign-up(s) · time zone ${c.timeZone}`}
              action={<Badge tone={c.status === "LIVE" ? "success" : c.status === "PILOT" ? "info" : "neutral"}>{c.status.replace("_", " ").toLowerCase()}</Badge>}
            />
            <CardBody className="space-y-5">
              <ActionForm action={updateCityAction as never} className="grid gap-3 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="cityId" value={c.id} />
                <Field label="City status" htmlFor={`cs-${c.id}`}>
                  <Select id={`cs-${c.id}`} name="status" defaultValue={c.status}>
                    <option value="LIVE">Live</option>
                    <option value="PILOT">Pilot</option>
                    <option value="COMING_SOON">Coming soon</option>
                    <option value="PAUSED">Paused</option>
                  </Select>
                </Field>
                <Field label="Support phone" htmlFor={`cp-${c.id}`}>
                  <Input id={`cp-${c.id}`} name="supportPhone" defaultValue={c.supportPhone ?? ""} />
                </Field>
                <Field label="Escalation contact" htmlFor={`ce-${c.id}`}>
                  <Input id={`ce-${c.id}`} name="escalationContact" defaultValue={c.escalationContact ?? ""} />
                </Field>
                <input type="hidden" name="supportEmail" value={c.supportEmail ?? ""} />
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save city
                </SubmitButton>
              </ActionForm>
              <div className="grid gap-4 lg:grid-cols-2">
                {areas
                  .filter((a) => a.cityId === c.id)
                  .map((a) => (
                    <details key={a.id} className="rounded-xl border border-line">
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <span className="font-semibold">{a.name}</span>
                        <span className="flex gap-2">
                          <Badge tone={a.status === "LIVE" ? "success" : "neutral"}>{a.status.toLowerCase()}</Badge>
                          <Badge tone="neutral">{a.technicians} pro(s)</Badge>
                          <Badge tone="neutral">{a.waitlist} waitlist</Badge>
                        </span>
                      </summary>
                      <div className="border-t border-line p-4">
                        <AreaForm cityId={c.id} area={a} categories={categories} />
                      </div>
                    </details>
                  ))}
                <details className="rounded-xl border border-dashed border-line-strong">
                  <summary className="cursor-pointer px-4 py-3 font-semibold text-brand">+ Add an area in {c.name}</summary>
                  <div className="border-t border-line p-4">
                    <AreaForm cityId={c.id} categories={categories} />
                  </div>
                </details>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      {unmatchedWaitlist.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Waitlist from pincodes we don't map yet" />
          <CardBody className="flex flex-wrap gap-2">
            {unmatchedWaitlist.map((w) => (
              <Badge key={w.pincode} tone="neutral">
                {w.pincode} · {w.n}
              </Badge>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}
