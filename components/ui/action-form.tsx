"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/cn";

type ServerAction = (prev: ActionResult<never> | null, formData: FormData) => Promise<ActionResult<unknown>>;

/**
 * Form bound to a Server Action with inline, accessible success/error feedback.
 * Pair with <SubmitButton> so the button disables while pending (no double submits).
 */
export function ActionForm({
  action,
  children,
  className,
  hideOnSuccess,
  render,
}: {
  action: ServerAction;
  children?: ReactNode;
  className?: string;
  hideOnSuccess?: ReactNode;
  render?: (state: ActionResult<unknown> | null) => ReactNode;
}) {
  const [state, formAction] = useActionState(action as never, null as ActionResult<unknown> | null);
  if (hideOnSuccess && state?.ok) return <>{hideOnSuccess}</>;
  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      {children}
      {render?.(state)}
      <div aria-live="polite">
        {state?.ok && state.message && <p className="text-sm font-semibold text-success">{state.message}</p>}
        {state && !state.ok && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
