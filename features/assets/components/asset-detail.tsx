import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import type { getAssetDetail } from "@/features/assets/service";
import { nextServiceSuggestion } from "@/features/assets/service";
import { addRecordAction, deleteAssetAction, deleteRecordAction, uploadAssetDocAction } from "@/features/assets/actions";
import { AssetForm } from "./asset-form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/surface";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { buttonClass } from "@/components/ui/button";
import { assetTypeLabels, serviceGuidance, categorySeeds } from "@/lib/config/catalog";
import { formatMoney } from "@/lib/money";
import { fmt, localDateKey } from "@/lib/time";

type Detail = NonNullable<Awaited<ReturnType<typeof getAssetDetail>>>;

export function AssetDetailView({ data, backHref, bookingHrefBase, units = [] }: { data: Detail; backHref: string; bookingHrefBase: string; units?: { id: string; label: string }[] }) {
  const { asset, records, documents, canEdit } = data;
  const today = localDateKey(new Date());
  const s = nextServiceSuggestion(asset, today);
  const category = categorySeeds.find((c) => c.assetTypes.includes(asset.assetType));
  const bookHref = `/book?${new URLSearchParams({ ...(category ? { category: category.slug } : {}), asset: asset.id, ...(asset.propertyId ? { property: asset.propertyId } : {}) })}`;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-wide text-ink-subtle uppercase">{assetTypeLabels[asset.assetType]}</p>
          <h1 className="font-display text-[30px] font-semibold text-ink">{asset.nickname}</h1>
          {asset.propertyName && (
            <p className="text-ink-muted">
              {asset.propertyName}
              {asset.unitLabel ? ` · ${asset.unitLabel}` : ""}
            </p>
          )}
        </div>
        <Link href={bookHref} className={buttonClass("primary", "md")}>
          Book a service for this
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Service history" description="HomeCare jobs are added automatically when you confirm completion." />
            <CardBody className="space-y-4">
              {records.length === 0 ? (
                <IllustratedEmpty scene="history" title="No records yet" body="Add a past service below, or book one." className="border-0 py-6" />
              ) : (
                <ol className="relative space-y-5 border-l border-line pl-6">
                  {records.map((r) => (
                    <li key={r.id} className="relative">
                      <span className={`absolute -left-[30px] top-1 size-3 rounded-full ring-4 ring-surface ${r.source === "JOB" ? "bg-brand" : "bg-sage"}`} aria-hidden />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink">{r.title}</p>
                        <Badge tone={r.source === "JOB" ? "brand" : "neutral"}>{r.source === "JOB" ? "HomeCare job" : "Added by you"}</Badge>
                      </div>
                      <p className="text-sm text-ink-muted">
                        {fmt.date(r.performedOn)}
                        {r.costPaise != null ? ` · ${formatMoney(r.costPaise)}` : ""}
                      </p>
                      {r.details && <p className="mt-1 text-sm text-ink-muted">{r.details}</p>}
                      <div className="mt-1 flex gap-4">
                        {r.bookingId && (
                          <Link href={`${bookingHrefBase}/${r.bookingId}`} className="text-sm font-semibold text-brand hover:underline">
                            View job {r.bookingReference}
                          </Link>
                        )}
                        {canEdit && r.source === "SELF_REPORTED" && (
                          <ActionForm action={deleteRecordAction as never} className="space-y-0">
                            <input type="hidden" name="recordId" value={r.id} />
                            <SubmitButton variant="ghost" size="sm" className="h-auto px-0 text-danger hover:bg-transparent" pendingLabel="Deleting…">
                              Delete
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {canEdit && (
                <details className="rounded-xl border border-line">
                  <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Record a past service</summary>
                  <div className="border-t border-line p-4">
                    <ActionForm action={addRecordAction as never}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Date" htmlFor="performedOn">
                          <Input id="performedOn" name="performedOn" type="date" max={today} required />
                        </Field>
                        <Field label="Cost in ₹ (optional)" htmlFor="costRupees">
                          <Input id="costRupees" name="costRupees" inputMode="decimal" />
                        </Field>
                      </div>
                      <Field label="What was done" htmlFor="title">
                        <Input id="title" name="title" required minLength={2} maxLength={160} placeholder="e.g. Filter replaced" />
                      </Field>
                      <Field label="Details (optional)" htmlFor="details">
                        <Textarea id="details" name="details" rows={2} />
                      </Field>
                      <SubmitButton variant="secondary" pendingLabel="Saving…">
                        Add record
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              )}
            </CardBody>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader title="Edit details" />
              <CardBody>
                <AssetForm values={asset} units={units} />
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="At a glance" />
            <CardBody className="py-2">
              <DescriptionList
                items={[
                  { label: "Brand / model", value: [asset.brand, asset.model].filter(Boolean).join(" ") || "—" },
                  { label: "Location", value: asset.locationInHome || "—" },
                  { label: "Installed", value: asset.installedOn ? fmt.date(asset.installedOn) : "—" },
                  {
                    label: "Manufacturer warranty",
                    value: asset.warrantyExpiresOn ? `${asset.warrantyExpiresOn >= today ? "Until" : "Ended"} ${fmt.date(asset.warrantyExpiresOn)}` : "—",
                  },
                  { label: "Last serviced", value: asset.lastServicedOn ? fmt.date(asset.lastServicedOn) : "No record" },
                ]}
              />
            </CardBody>
          </Card>
          <Alert tone={s.overdue ? "warning" : "info"} title="Service suggestion">
            {s.nextServiceOn ? `${s.overdue ? "Suggested since" : "Around"} ${fmt.date(s.nextServiceOn)}. ` : "Add an installation or service date to get a suggestion. "}
            {serviceGuidance[asset.assetType].note} This is general guidance from HomeCare, not an inspection result or manufacturer instruction.
          </Alert>
          <Card>
            <CardHeader title="Documents" description="Warranty cards, invoices or manuals (JPG, PNG, WebP or PDF, 5 MB)." />
            <CardBody className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-sm text-ink-muted">No documents yet.</p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((d) => (
                    <li key={d.id}>
                      <a href={`/api/files/${d.id}`} target="_blank" rel="noopener" className="flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
                        <FileText className="size-4" aria-hidden /> {d.originalName ?? d.purpose.replace("_", " ").toLowerCase()}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <ActionForm action={uploadAssetDocAction as never}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <Select name="purpose" aria-label="Document type" defaultValue="WARRANTY_DOCUMENT">
                    <option value="WARRANTY_DOCUMENT">Warranty document</option>
                    <option value="INVOICE_DOCUMENT">Purchase invoice</option>
                  </Select>
                  <input name="files" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" aria-label="File" />
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Uploading…">
                    Upload
                  </SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
          {canEdit && (
            <details className="rounded-xl border border-white/70 bg-white/60">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-danger">Delete this appliance</summary>
              <div className="border-t border-line p-4">
                <ActionForm action={deleteAssetAction as never}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="returnTo" value={backHref} />
                  <p className="text-sm text-ink-muted">Deletes the appliance, its documents and records you added. HomeCare job records stay in your history.</p>
                  <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
                    Delete permanently
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
