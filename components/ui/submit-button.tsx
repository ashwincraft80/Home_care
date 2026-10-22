"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "./button";
import { InlineButtonLoader } from "@/components/motion/loaders";

/**
 * Submit button that disables itself while its form's Server Action is pending, preventing
 * duplicate submissions, and re-enables automatically when the action returns (success or error).
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending || props.disabled} {...props}>
      {pending && <InlineButtonLoader />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
