"use client";

import { useActionState } from "react";
import { createComplaintAction } from "@/features/complaints/actions";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";

export function NewComplaintForm({
  isTechnician,
  bookings,
  defaultBooking,
  defaultCategory,
}: {
  isTechnician: boolean;
  bookings: { id: string; label: string }[];
  defaultBooking?: string;
  defaultCategory?: string;
}) {
  const [state, action] = useActionState(createComplaintAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const categories = isTechnician
    ? [
        ["PAYOUT", "Payout"],
        ["BEHAVIOUR", "Customer behaviour"],
        ["SAFETY", "Safety concern"],
        ["PRICING", "Pricing dispute"],
        ["OTHER", "Something else"],
      ]
    : [
        ["QUALITY", "Work quality"],
        ["WARRANTY_CLAIM", "Warranty claim"],
        ["PRICING", "Pricing or charges"],
        ["NO_SHOW", "Professional didn't come"],
        ["BEHAVIOUR", "Professional's behaviour"],
        ["DAMAGE", "Damage to property"],
        ["SAFETY", "Safety concern"],
        ["OTHER", "Something else"],
      ];
  return (
    <form action={action} className="space-y-4">
      <Field label="Which booking? (optional)" htmlFor="bookingId">
        <Select id="bookingId" name="bookingId" defaultValue={defaultBooking ?? ""}>
          <option value="">Not about a specific booking</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type of issue" htmlFor="category" error={fe?.category}>
        <Select id="category" name="category" defaultValue={defaultCategory ?? categories[0][0]}>
          {categories.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What happened?" htmlFor="description" error={fe?.description}>
        <Textarea id="description" name="description" rows={5} required minLength={10} maxLength={2000} />
      </Field>
      {state && !state.ok && !fe && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton pendingLabel="Sending…">Submit</SubmitButton>
    </form>
  );
}
