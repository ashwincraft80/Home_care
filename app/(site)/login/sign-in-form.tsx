"use client";

import { useActionState } from "react";
import { signInAction } from "@/lib/auth/actions";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";

export function SupabaseSignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" htmlFor="email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
      </Field>
      {state && !state.ok && !fe && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
