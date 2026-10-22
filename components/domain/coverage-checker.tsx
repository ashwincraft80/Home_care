"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, MapPin, SearchX } from "lucide-react";
import { checkPincodeAction, joinWaitlistAction, type CoverageResult } from "@/features/locations/actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";
import { InlineButtonLoader } from "@/components/motion/loaders";

const STATUS_COPY: Record<Exclude<CoverageResult["status"], "SERVED">, (r: CoverageResult) => string> = {
  AREA_NOT_LIVE: (r) => `${r.areaName}, ${r.cityName} is on our list but not open for bookings yet.`,
  CITY_NOT_LIVE: (r) => `We're not taking bookings in ${r.cityName} yet.`,
  UNKNOWN_PINCODE: () => "We don't serve this pincode yet.",
};

/** Pincode-first availability check with an honest unavailable-area flow and a consent-based waitlist. */
export function CoverageChecker({ compact = false, initialPincode = "" }: { compact?: boolean; initialPincode?: string }) {
  const [pincode, setPincode] = useState(initialPincode);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [waitlist, waitlistAction] = useActionState(joinWaitlistAction, null);

  const check = () =>
    start(async () => {
      setError(null);
      const res = await checkPincodeAction(pincode);
      if (res.ok) setResult(res.data);
      else {
        setResult(null);
        setError(res.error);
      }
    });

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <div className="relative flex-1">
          <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-ink-subtle" />
          <label htmlFor="coverage-pincode" className="sr-only">
            Pincode
          </label>
          <Input
            id="coverage-pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="Enter your 6-digit pincode"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
            className="pl-10"
            aria-describedby={error ? "coverage-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={pending || pincode.length !== 6} variant="secondary">
          {pending ? <InlineButtonLoader /> : null}
          Check
        </Button>
      </form>

      <div aria-live="polite">
        {error && (
          <p id="coverage-error" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {result?.status === "SERVED" && (
          <div className="rounded-xl border border-[#c8e4d1] bg-success-soft p-4">
            <p className="flex items-center gap-2 font-semibold text-[#115430]">
              <CheckCircle2 className="size-5" aria-hidden /> We serve {result.areaName}, {result.cityName}
            </p>
            {!compact && (
              <p className="mt-1.5 text-sm text-[#115430]/90">
                Available here: {result.categories.map((c) => c.name).join(", ")}. Time windows depend on which professionals are free.
              </p>
            )}
            <Link href={`/book?pincode=${result.pincode}`} className={buttonClass("primary", "sm", "mt-3")}>
              Book in {result.areaName}
            </Link>
          </div>
        )}
        {result && result.status !== "SERVED" && (
          <div className="rounded-xl border border-white/70 bg-white/60 p-4">
            <p className="flex items-start gap-2 font-semibold text-ink">
              <SearchX className="mt-0.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
              {STATUS_COPY[result.status](result)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">We expand area by area once we have enough reliable professionals. Want to hear when we arrive?</p>
            {waitlist?.ok ? (
              <Alert tone="success" className="mt-3">
                {waitlist.message}
              </Alert>
            ) : (
              <form action={waitlistAction} className="mt-3 space-y-3">
                <input type="hidden" name="pincode" value={result.pincode} />
                <Field label="Email (optional if you're signed in)" htmlFor="waitlist-email" error={waitlist && !waitlist.ok ? waitlist.fieldErrors?.email : undefined}>
                  <Input id="waitlist-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
                </Field>
                <Checkbox name="consent" label="You may email me only about service availability in my area." />
                {waitlist && !waitlist.ok && <p className="text-sm font-medium text-danger">{waitlist.error}</p>}
                <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
                  Notify me
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
