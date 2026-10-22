import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getTechnicianProfile } from "@/features/technicians/service";
import { listActiveCategories } from "@/features/catalog/service";
import { listLiveAreas } from "@/features/locations/service";
import { updateTechnicianProfileAction } from "@/features/technicians/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { appointmentWindows } from "@/lib/config/site";

export const metadata: Metadata = { title: "Profile & availability" };
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const statusTone = { APPROVED: "success", PENDING_REVIEW: "info", SUSPENDED: "danger", REJECTED: "danger" } as const;

export default async function TechProfilePage() {
  const actor = await requireActor("TECHNICIAN");
  const db = await getDb();
  const [profile, categories, areas] = await Promise.all([getTechnicianProfile(db, actor), listActiveCategories(db), listLiveAreas(db)]);
  const p = profile ?? { verificationStatus: "PENDING_REVIEW" as const, bio: "", yearsExperience: 0, phone: "", categoryIds: [] as string[], serviceAreaIds: [] as string[], availability: [] as string[], reviewNotes: null as string | null };
  return (
    <>
      <PageHeader title="Profile & availability" description="Customers only see your name, experience and (after 5 reviews) your rating. Your phone is shared only during an active job." />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={statusTone[p.verificationStatus]}>Profile: {p.verificationStatus.replace("_", " ").toLowerCase()}</Badge>
        {p.reviewNotes && <p className="text-sm text-ink-muted">Operations note: {p.reviewNotes}</p>}
      </div>
      <Alert tone="info" className="mb-6">
        Operations reviews profiles manually. Formal ID/background verification through a third-party provider isn&apos;t integrated yet, so we never show customers a “verified” badge for it.
      </Alert>
      <ActionForm action={updateTechnicianProfileAction as never} className="space-y-6">
        <Card>
          <CardHeader title="About you" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={p.phone ?? ""} required />
            </Field>
            <Field label="Years of experience" htmlFor="yearsExperience">
              <Input id="yearsExperience" name="yearsExperience" inputMode="numeric" defaultValue={String(p.yearsExperience ?? 0)} required />
            </Field>
            <Field label="Short bio (optional)" htmlFor="bio" className="sm:col-span-2">
              <Textarea id="bio" name="bio" defaultValue={p.bio ?? ""} rows={2} maxLength={600} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Services you offer" />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={p.categoryIds.includes(c.id)} className="size-5 accent-brand" />
                <span className="font-semibold">{c.name}</span>
              </label>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Areas you cover" description="Only live service areas are listed." />
          <CardBody className="grid gap-2 sm:grid-cols-3">
            {areas.map((a) => (
              <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="serviceAreaIds" value={a.id} defaultChecked={p.serviceAreaIds.includes(a.id)} className="size-5 accent-brand" />
                <span>
                  <span className="font-semibold">{a.name}</span> <span className="text-sm text-ink-muted">· {a.cityName}</span>
                </span>
              </label>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Weekly availability" description="Customers can only book windows where at least one professional is available. Evening and Sunday windows open only if you tick them." />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr>
                  <th className="pb-2 text-left font-semibold text-ink-muted">Window</th>
                  {days.map((d) => (
                    <th key={d} className="pb-2 text-center font-semibold text-ink-muted">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointmentWindows.map((w) => (
                  <tr key={w.key} className="border-t border-line">
                    <th scope="row" className="py-2 text-left font-semibold tabular-nums">
                      {w.start}–{w.end}
                    </th>
                    {days.map((d, i) => (
                      <td key={d} className="py-2 text-center">
                        <input
                          type="checkbox"
                          name="availability"
                          value={`${i}:${w.key}`}
                          defaultChecked={p.availability.includes(`${i}:${w.key}`)}
                          aria-label={`${d} ${w.start} to ${w.end}`}
                          className="size-5 accent-brand"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <SubmitButton size="lg" pendingLabel="Saving…">
          Save profile
        </SubmitButton>
      </ActionForm>
    </>
  );
}
