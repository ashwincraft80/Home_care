"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorStateIllustration } from "@/components/motion/illustrations";
import { Button, buttonClass } from "@/components/ui/button";

/** Calm, recoverable error state: retry or reach support. Never a permanent spinner. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" role="alert" className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <ErrorStateIllustration className="mx-auto" />
        <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Something didn&apos;t load</h1>
        <p className="mt-2 text-ink-muted">It&apos;s on our side. Please try again — your bookings and data are safe.</p>
        {error.digest && <p className="mt-2 text-xs text-ink-subtle">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/contact" className={buttonClass("secondary", "md")}>
            Contact support
          </Link>
        </div>
      </div>
    </main>
  );
}
