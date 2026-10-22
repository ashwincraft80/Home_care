"use client";

import { useActionState } from "react";
import { createAssetAction, updateAssetAction } from "@/features/assets/actions";
import { assetTypeLabels, assetTypes } from "@/lib/config/catalog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";

export interface AssetFormValues {
  id?: string;
  assetType?: string;
  nickname?: string;
  brand?: string | null;
  model?: string | null;
  locationInHome?: string | null;
  installedOn?: string | null;
  warrantyExpiresOn?: string | null;
  notes?: string | null;
  unitId?: string | null;
}

/** Only the type and a name are required — people shouldn't have to register details to book. */
export function AssetForm({ values = {}, propertyId, units = [] }: { values?: AssetFormValues; propertyId?: string; units?: { id: string; label: string }[] }) {
  const editing = Boolean(values.id);
  const [state, action] = useActionState((editing ? updateAssetAction : createAssetAction) as typeof updateAssetAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      {values.id && <input type="hidden" name="assetId" value={values.id} />}
      {propertyId && <input type="hidden" name="propertyId" value={propertyId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="assetType" error={fe?.assetType}>
          <Select id="assetType" name="assetType" defaultValue={values.assetType ?? "AC"} required>
            {assetTypes.map((t) => (
              <option key={t} value={t}>
                {assetTypeLabels[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="nickname" hint="e.g. Bedroom AC" error={fe?.nickname}>
          <Input id="nickname" name="nickname" defaultValue={values.nickname ?? ""} required maxLength={80} />
        </Field>
        <Field label="Brand (optional)" htmlFor="brand">
          <Input id="brand" name="brand" defaultValue={values.brand ?? ""} maxLength={80} />
        </Field>
        <Field label="Model (optional)" htmlFor="model">
          <Input id="model" name="model" defaultValue={values.model ?? ""} maxLength={80} />
        </Field>
        <Field label="Where is it? (optional)" htmlFor="locationInHome">
          <Input id="locationInHome" name="locationInHome" defaultValue={values.locationInHome ?? ""} maxLength={80} />
        </Field>
        {units.length > 0 && (
          <Field label="Unit (optional)" htmlFor="unitId">
            <Select id="unitId" name="unitId" defaultValue={values.unitId ?? ""}>
              <option value="">Common area</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Installed on (optional)" htmlFor="installedOn" error={fe?.installedOn}>
          <Input id="installedOn" name="installedOn" type="date" defaultValue={values.installedOn ?? ""} />
        </Field>
        <Field label="Manufacturer warranty until (optional)" htmlFor="warrantyExpiresOn" error={fe?.warrantyExpiresOn}>
          <Input id="warrantyExpiresOn" name="warrantyExpiresOn" type="date" defaultValue={values.warrantyExpiresOn ?? ""} />
        </Field>
      </div>
      <Field label="Notes (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={values.notes ?? ""} rows={2} maxLength={1000} />
      </Field>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <SubmitButton pendingLabel="Saving…">{editing ? "Save changes" : "Add to passport"}</SubmitButton>
    </form>
  );
}
