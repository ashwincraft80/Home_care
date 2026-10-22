"use client";

import Link from "next/link";
import { useActionState } from "react";
import { demoSignUpAction, signUpAction } from "@/lib/auth/actions";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

const intents = [
  { v: "customer", label: "I need services for my home", note: "Homeowners, tenants and students" },
  { v: "property_manager", label: "I manage properties", note: "Landlords and property managers" },
  { v: "technician", label: "I'm a professional", note: "Your profile is reviewed before you get jobs" },
];

export function SignUpForm({ demo, next, defaultIntent }: { demo: boolean; next?: string; defaultIntent: string }) {
  const [state, action] = useActionState(demo ? demoSignUpAction : signUpAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Your name" htmlFor="fullName" error={fe?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>
      {!demo && (
        <>
          <Field label="Email" htmlFor="email" error={fe?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters." error={fe?.password}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </>
      )}
      <fieldset>
        <legend className="text-sm font-semibold text-ink">How will you use HomeCare?</legend>
        <div className="mt-2 grid gap-2">
          {intents.map((i) => (
            <label key={i.v} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-white/70 bg-white/60 p-3.5 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20")}>
              <input type="radio" name="intent" value={i.v} defaultChecked={i.v === defaultIntent} className="mt-1 size-4 accent-brand" />
              <span>
                <span className="block font-semibold text-ink">{i.label}</span>
                <span className="block text-sm text-ink-muted">{i.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Checkbox
        name="terms"
        label={
          <>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-brand underline" target="_blank">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-semibold text-brand underline" target="_blank">
              privacy policy
            </Link>
            .
          </>
        }
      />
      {fe?.terms && <p className="text-sm font-medium text-danger">{fe.terms[0]}</p>}
      {state && !state.ok && !fe && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton className="w-full" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
