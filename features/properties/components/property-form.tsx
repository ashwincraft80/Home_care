"use client";

import { useActionState } from "react";
import { createPropertyAction, updatePropertyAction } from "@/features/properties/actions";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";

export function PropertyForm({ values }: { values?: { id: string; name: string; propertyType: string; line1: string; pincode: string } }) {
  const [state, action] = useActionState((values ? updatePropertyAction : createPropertyAction) as typeof updatePropertyAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      {values && <input type="hidden" name="propertyId" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property name" htmlFor="name" error={fe?.name}>
          <Input id="name" name="name" defaultValue={values?.name} required />
        </Field>
        <Field label="Type" htmlFor="propertyType">
          <Select id="propertyType" name="propertyType" defaultValue={values?.propertyType ?? "RESIDENTIAL"}>
            <option value="RESIDENTIAL">House / villa</option>
            <option value="APARTMENT_BLOCK">Apartment block</option>
            <option value="COMMERCIAL">Office / commercial</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Address" htmlFor="line1" error={fe?.line1}>
          <Input id="line1" name="line1" defaultValue={values?.line1} required />
        </Field>
        <Field label="Pincode" htmlFor="pincode" hint="We'll tell you if it's inside our service areas." error={fe?.pincode}>
          <Input id="pincode" name="pincode" inputMode="numeric" maxLength={6} defaultValue={values?.pincode} required />
        </Field>
      </div>
      {state && !state.ok && !fe && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <SubmitButton pendingLabel="Saving…">{values ? "Save property" : "Add property"}</SubmitButton>
    </form>
  );
}
