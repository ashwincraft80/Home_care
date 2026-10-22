"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Building, Camera, Check, House, KeyRound, MapPin, X } from "lucide-react";
import { createBookingAction, getSlotsAction } from "@/features/bookings/actions";
import { checkPincodeAction, type CoverageResult } from "@/features/locations/actions";
import { trackClientEvent } from "@/lib/analytics/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/surface";
import { ServiceTile } from "@/components/domain/brand";
import { BookingSubmitLoader, InlineButtonLoader } from "@/components/motion/loaders";
import Link from "next/link";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export interface WizardCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  shortDescription: string;
  visitFeePaise: number;
  indicativeMinPaise: number | null;
  indicativeMaxPaise: number | null;
  commonJobs: string[];
  warrantyDays: number;
  assetTypes: string[];
}

export interface WizardProperty {
  id: string;
  name: string;
  memberRole: string;
  pincode: string;
  locality: string;
  tenantUnitId: string | null;
  units: { id: string; label: string }[];
}

interface Slot {
  date: string;
  windowKey: string;
  start: string;
  end: string;
  remaining: number;
  unavailableReason: "full" | "no_professional" | null;
}

type Strings = Dictionary["booking"];
const STEPS = ["stepService", "stepAddress", "stepTime", "stepProblem", "stepReview"] as const;

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BookingWizard({
  t,
  categories,
  savedAddresses,
  properties,
  assets,
  initial,
  cancellationSummary,
}: {
  t: Strings;
  categories: WizardCategory[];
  savedAddresses: { id: string; label: string; line1: string; pincode: string; locality: string }[];
  properties: WizardProperty[];
  assets: { id: string; nickname: string; assetType: string; propertyId: string | null; unitId: string | null }[];
  initial: { categorySlug?: string; issue?: string; pincode?: string; propertyId?: string; assetId?: string; repeat?: boolean };
  cancellationSummary: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const initialCategory = categories.find((c) => c.slug === initial.categorySlug);
  const [categoryId, setCategoryId] = useState<string>(initialCategory?.id ?? "");
  const [mode, setMode] = useState<"home" | "property">(initial.propertyId && properties.some((p) => p.id === initial.propertyId) ? "property" : "home");
  const [occupancy, setOccupancy] = useState<"OWNER" | "TENANT">("OWNER");
  const [costApproval, setCostApproval] = useState<"REQUESTER" | "LANDLORD">("REQUESTER");
  const [selfLimit, setSelfLimit] = useState("");
  const [addressChoice, setAddressChoice] = useState<string>(savedAddresses[0] && !initial.pincode ? savedAddresses[0].id : "new");
  const [address, setAddress] = useState({ line1: "", landmark: "", pincode: initial.pincode ?? "" });
  const [saveAddress, setSaveAddress] = useState(true);
  const [propertyId, setPropertyId] = useState(initial.propertyId ?? properties[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [coverageState, setCoverage] = useState<CoverageResult | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [date, setDate] = useState("");
  const [windowKey, setWindowKey] = useState("");
  const [description, setDescription] = useState(initial.issue ? `${initial.issue}. ` : "");
  const [assetId, setAssetId] = useState(initial.assetId ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [idempotencyKey] = useState(newKey);
  const [stepError, setStepError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, formAction, submitting] = useActionState(async (prev: Awaited<ReturnType<typeof createBookingAction>> | null, fd: FormData) => {
    const res = await createBookingAction(prev, fd);
    if (res.ok) {
      router.push(res.data.href);
      return res;
    }
    void trackClientEvent("booking_failed", { reason: res.code ?? "error" });
    const fields = Object.keys(res.fieldErrors ?? {});
    if (fields.some((f) => f.startsWith("address") || f === "unitId")) setStep(1);
    else if (fields.includes("windowKey") || res.code === "CONFLICT") {
      setStep(2);
      setSlots(null);
    } else if (fields.includes("problemDescription")) setStep(3);
    else if (fields.includes("categoryId")) setStep(0);
    return res;
  }, null);

  const category = categories.find((c) => c.id === categoryId);
  const property = properties.find((p) => p.id === propertyId);
  const isTenantMember = property?.memberRole === "TENANT";
  const effectivePincode =
    mode === "property" ? (property?.pincode ?? "") : addressChoice === "new" ? address.pincode : (savedAddresses.find((a) => a.id === addressChoice)?.pincode ?? "");
  // Only trust a coverage result that matches the pincode currently entered.
  const coverage = coverageState?.pincode === effectivePincode ? coverageState : null;

  useEffect(() => {
    void trackClientEvent(initial.repeat ? "repeat_booking_started" : "booking_started", { category: initialCategory?.slug ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Coverage for the chosen location.
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(effectivePincode)) return;
    startCheck(async () => {
      const res = await checkPincodeAction(effectivePincode, category?.slug);
      if (res.ok) {
        setCoverage(res.data);
        setCoverageError(null);
      } else {
        setCoverage(null);
        setCoverageError(res.error);
      }
    });
  }, [effectivePincode, category?.slug]);

  const categoryAvailableHere = coverage?.status === "SERVED" && coverage.categories.some((c) => c.id === categoryId);
  const dates = useMemo(() => [...new Set((slots ?? []).map((s) => s.date))], [slots]);
  const activeDate = date || dates.find((d) => slots?.some((s) => s.date === d && s.remaining > 0)) || dates[0];

  const loadSlots = () =>
    startSlots(async () => {
      setSlotsError(null);
      const res = await getSlotsAction(categoryId, effectivePincode);
      if (!res.ok) setSlotsError(res.error);
      else setSlots((res.data.slots as Slot[]) ?? []);
    });

  const validate = (s: number): string | null => {
    if (s === 0 && !categoryId) return "Choose a service to continue.";
    if (s === 1) {
      if (mode === "property") {
        if (!property) return "Choose a property.";
      } else if (addressChoice === "new") {
        if (address.line1.trim().length < 3) return "Add your house / flat and street.";
        if (!/^[1-9][0-9]{5}$/.test(address.pincode)) return "Enter a valid 6-digit pincode.";
      }
      if (!coverage) return checking ? "Checking your area…" : "We couldn't check this pincode yet.";
      if (coverage.status !== "SERVED") return t.notServed;
      if (!categoryAvailableHere) return `${category?.name} isn't available in ${coverage.areaName} yet.`;
      if (mode === "home" && occupancy === "TENANT" && costApproval === "LANDLORD" && selfLimit && !/^\d{1,6}$/.test(selfLimit)) return "Enter a whole rupee amount.";
    }
    if (s === 2 && (!date || !windowKey)) return "Choose a time window.";
    if (s === 3 && description.trim().length < 10) return "Describe the problem in a few words (at least 10 characters).";
    return null;
  };

  const next = () => {
    const err = validate(step);
    setStepError(err);
    if (err) return;
    if (step === 1) {
      setSlots(null);
      setDate("");
      setWindowKey("");
      loadSlots();
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const payload = JSON.stringify({
    categoryId,
    problemDescription: description.trim(),
    date,
    windowKey,
    ...(mode === "property"
      ? { propertyId, unitId: isTenantMember ? property?.tenantUnitId : unitId || undefined }
      : addressChoice === "new"
        ? { address: { line1: address.line1, landmark: address.landmark || undefined, pincode: address.pincode }, saveAddress }
        : { savedAddressId: addressChoice }),
    assetId: assetId || undefined,
    occupancy: mode === "home" ? occupancy : "OWNER",
    costApproval: mode === "home" && occupancy === "TENANT" ? costApproval : "REQUESTER",
    selfApprovalLimit: mode === "home" && occupancy === "TENANT" && costApproval === "LANDLORD" ? selfLimit : undefined,
    paymentMethod: "PAY_AFTER_SERVICE",
    idempotencyKey,
    acceptPolicy,
    isRepeat: Boolean(initial.repeat),
  });

  const relevantAssets = assets.filter((a) =>
    mode === "property" ? a.propertyId === propertyId && (!isTenantMember || !a.unitId || a.unitId === property?.tenantUnitId) : !a.propertyId,
  );
  const slotLabel = (s?: Slot) => (s ? fmt.window(s.start, s.end) : "");
  const chosenSlot = slots?.find((s) => s.date === date && s.windowKey === windowKey);

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input type="hidden" name="payload" value={payload} />
      <div className="min-w-0">
        {/* Progress */}
        <ol className="mb-6 flex gap-1.5" aria-label="Booking progress">
          {STEPS.map((k, i) => (
            <li key={k} className="flex-1" aria-current={i === step ? "step" : undefined}>
              <div className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-surface-sunken")} />
              <span className={cn("mt-1.5 hidden text-xs font-semibold sm:block", i === step ? "text-ink" : "text-ink-subtle")}>{t[k]}</span>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduced ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {step === 0 && (
              <section aria-labelledby="step-title">
                <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
                  {t.chooseService}
                </h2>
                <div className="mt-5 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label={t.chooseService}>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={categoryId === c.id}
                      onClick={() => {
                        setCategoryId(c.id);
                        void trackClientEvent("service_category_selected", { category: c.slug, surface: "booking" });
                      }}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border bg-surface p-4 text-left transition-colors",
                        categoryId === c.id ? "border-brand ring-2 ring-brand/20" : "border-line hover:border-line-strong",
                      )}
                    >
                      <ServiceTile icon={c.icon} size="sm" />
                      <span className="min-w-0">
                        <span className="block font-bold text-ink">{c.name}</span>
                        <span className="mt-0.5 block text-sm text-ink-muted">Visit fee {formatMoney(c.visitFeePaise)}</span>
                      </span>
                      {categoryId === c.id && <Check className="ml-auto size-5 shrink-0 text-brand" aria-hidden />}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 1 && (
              <section aria-labelledby="step-title" className="space-y-6">
                <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
                  {t.address}
                </h2>
                {properties.length > 0 && (
                  <div className="inline-flex rounded-xl border border-line bg-surface-muted p-1" role="radiogroup" aria-label="Booking for">
                    {[
                      { v: "home" as const, label: "My home", icon: House },
                      { v: "property" as const, label: "A property I manage or rent", icon: Building },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        role="radio"
                        aria-checked={mode === o.v}
                        onClick={() => setMode(o.v)}
                        className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold", mode === o.v ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-muted")}
                      >
                        <o.icon className="size-4" aria-hidden />
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}

                {mode === "property" ? (
                  <div className="space-y-4">
                    <Field label="Property" htmlFor="property">
                      <Select id="property" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); }}>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.locality}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {property && (isTenantMember ? (
                      <Alert tone="info">
                        You&apos;re booking for your unit ({property.units.find((u) => u.id === property.tenantUnitId)?.label}). Costs are approved under the property&apos;s rules; anything above your limit goes to the owner or manager.
                      </Alert>
                    ) : property.units.length > 0 ? (
                      <Field label="Unit (optional)" htmlFor="unit">
                        <Select id="unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                          <option value="">Common area / whole property</option>
                          {property.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null)}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {savedAddresses.length > 0 && (
                      <div className="grid gap-2" role="radiogroup" aria-label={t.savedAddress}>
                        {savedAddresses.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            role="radio"
                            aria-checked={addressChoice === a.id}
                            onClick={() => setAddressChoice(a.id)}
                            className={cn("flex items-start gap-3 rounded-xl border bg-surface p-3.5 text-left", addressChoice === a.id ? "border-brand ring-2 ring-brand/20" : "border-line")}
                          >
                            <MapPin className="mt-0.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
                            <span>
                              <span className="block font-semibold text-ink">{a.label}</span>
                              <span className="block text-sm text-ink-muted">
                                {a.line1}, {a.locality} {a.pincode}
                              </span>
                            </span>
                          </button>
                        ))}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={addressChoice === "new"}
                          onClick={() => setAddressChoice("new")}
                          className={cn("rounded-xl border bg-surface p-3.5 text-left font-semibold", addressChoice === "new" ? "border-brand ring-2 ring-brand/20" : "border-line text-ink-muted")}
                        >
                          + {t.newAddress}
                        </button>
                      </div>
                    )}
                    {addressChoice === "new" && (
                      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                        <Field label={t.pincode} htmlFor="pincode">
                          <Input
                            id="pincode"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            maxLength={6}
                            value={address.pincode}
                            onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "") }))}
                          />
                        </Field>
                        <Field label={t.line1} htmlFor="line1">
                          <Input id="line1" autoComplete="street-address" value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))} />
                        </Field>
                        <Field label={t.landmark} htmlFor="landmark" className="sm:col-span-2">
                          <Input id="landmark" value={address.landmark} onChange={(e) => setAddress((a) => ({ ...a, landmark: e.target.value }))} />
                        </Field>
                        <Checkbox className="sm:col-span-2" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} label={t.saveAddress} />
                      </div>
                    )}

                    <fieldset className="space-y-3">
                      <legend className="text-sm font-semibold text-ink">{t.occupancyQ}</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { v: "OWNER" as const, label: t.own, icon: House },
                          { v: "TENANT" as const, label: t.rent, icon: KeyRound },
                        ].map((o) => (
                          <label key={o.v} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-3.5 font-semibold", occupancy === o.v ? "border-brand ring-2 ring-brand/20" : "border-line")}>
                            <input type="radio" name="occupancy-ui" className="sr-only" checked={occupancy === o.v} onChange={() => { setOccupancy(o.v); if (o.v === "OWNER") setCostApproval("REQUESTER"); }} />
                            <o.icon className="size-5 text-brand" aria-hidden />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {occupancy === "TENANT" && (
                      <fieldset className="space-y-3 rounded-xl border border-line bg-surface-muted/60 p-4">
                        <legend className="px-1 text-sm font-semibold text-ink">{t.approverQ}</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {[
                            { v: "REQUESTER" as const, label: t.approveMe },
                            { v: "LANDLORD" as const, label: t.approveLandlord },
                          ].map((o) => (
                            <label key={o.v} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-3 text-sm font-semibold", costApproval === o.v ? "border-brand ring-2 ring-brand/20" : "border-line")}>
                              <input type="radio" name="approval-ui" className="size-4 accent-brand" checked={costApproval === o.v} onChange={() => setCostApproval(o.v)} />
                              {o.label}
                            </label>
                          ))}
                        </div>
                        {costApproval === "LANDLORD" && (
                          <>
                            <Field label={t.selfLimit} htmlFor="selfLimit" hint={t.selfLimitHint}>
                              <Input id="selfLimit" inputMode="numeric" value={selfLimit} onChange={(e) => setSelfLimit(e.target.value.replace(/\D/g, ""))} className="max-w-40" placeholder="e.g. 300" />
                            </Field>
                            <p className="text-sm text-ink-muted">After booking, you&apos;ll get a secure link to send your landlord. They only see this booking.</p>
                          </>
                        )}
                      </fieldset>
                    )}
                  </div>
                )}

                <div aria-live="polite" className="min-h-6">
                  {checking && (
                    <p className="flex items-center gap-2 text-sm text-ink-muted">
                      <InlineButtonLoader /> Checking your area…
                    </p>
                  )}
                  {!checking && coverageError && <p className="text-sm font-medium text-danger">{coverageError}</p>}
                  {!checking && coverage?.status === "SERVED" && categoryAvailableHere && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-success">
                      <Check className="size-4" aria-hidden /> We serve {coverage.areaName}, {coverage.cityName}
                    </p>
                  )}
                  {!checking && coverage?.status === "SERVED" && !categoryAvailableHere && (
                    <Alert tone="warning">
                      {category?.name} isn&apos;t offered in {coverage.areaName} yet. Available here: {coverage.categories.map((c) => c.name).join(", ")}.
                    </Alert>
                  )}
                  {!checking && coverage && coverage.status !== "SERVED" && (
                    <div className="rounded-xl border border-white/70 bg-white/60 p-4">
                      <p className="font-semibold text-ink">{t.notServed}.</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {coverage.status === "AREA_NOT_LIVE" || coverage.status === "CITY_NOT_LIVE"
                          ? `${coverage.areaName}, ${coverage.cityName} isn't open for bookings yet.`
                          : "This pincode is outside our current service areas."}{" "}
                        We open new areas once enough reliable professionals are available.
                      </p>
                      <Link href={`/coverage?pincode=${effectivePincode}`} className="mt-3 inline-flex text-sm font-semibold text-brand underline-offset-2 hover:underline">
                        Join the waitlist for {effectivePincode}
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="step-title" className="space-y-5">
                <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
                  {t.chooseTime}
                </h2>
                {loadingSlots && (
                  <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
                    <InlineButtonLoader /> Checking which professionals are free…
                  </p>
                )}
                {slotsError && (
                  <Alert tone="danger" title="We couldn't load time windows">
                    {slotsError}{" "}
                    <button type="button" className="font-semibold underline" onClick={loadSlots}>
                      Try again
                    </button>
                  </Alert>
                )}
                {slots && slots.every((s) => s.remaining === 0) && (
                  <Alert tone="warning" title="No windows available this week">
                    No professional for {category?.name} is free in your area over the next 7 days. Please check back tomorrow or contact support.
                  </Alert>
                )}
                {slots && dates.length > 0 && (
                  <>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Date">
                      {dates.map((d) => {
                        const open = slots.some((s) => s.date === d && s.remaining > 0);
                        const first = slots.find((s) => s.date === d)!;
                        return (
                          <button
                            key={d}
                            type="button"
                            role="tab"
                            aria-selected={activeDate === d}
                            onClick={() => setDate(d)}
                            className={cn(
                              "shrink-0 rounded-xl border px-3.5 py-2.5 text-left",
                              activeDate === d ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink",
                              !open && activeDate !== d && "opacity-60",
                            )}
                          >
                            <span className="block text-sm font-bold">{fmt.day(first.start)}</span>
                            <span className={cn("block text-xs", activeDate === d ? "text-white/80" : "text-ink-subtle")}>{open ? "Available" : "Unavailable"}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Time window">
                      {slots
                        .filter((s) => s.date === activeDate)
                        .map((s) => {
                          const disabled = s.remaining === 0;
                          const chosen = date === s.date && windowKey === s.windowKey;
                          return (
                            <button
                              key={s.windowKey}
                              type="button"
                              role="radio"
                              aria-checked={chosen}
                              disabled={disabled}
                              onClick={() => {
                                setDate(s.date);
                                setWindowKey(s.windowKey);
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-xl border p-3.5 text-left",
                                chosen ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-line bg-surface",
                                disabled && "cursor-not-allowed bg-surface-muted text-ink-subtle",
                              )}
                            >
                              <span className="font-semibold tabular-nums">
                                {fmt.time(s.start)} – {fmt.time(s.end)}
                              </span>
                              {disabled ? (
                                <span className="text-xs font-semibold">{s.unavailableReason === "no_professional" ? t.noProfessional : t.windowFull}</span>
                              ) : s.remaining === 1 ? (
                                <Badge tone="warning">{t.fewLeft}</Badge>
                              ) : null}
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </section>
            )}

            {step === 3 && (
              <section aria-labelledby="step-title" className="space-y-5">
                <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
                  {t.describeProblem}
                </h2>
                {category && category.commonJobs.length > 0 && (
                  <div className="flex flex-wrap gap-2" aria-label="Common problems">
                    {category.commonJobs.map((j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => setDescription((d) => (d.includes(j) ? d : `${d}${d && !d.endsWith(" ") ? ". " : ""}${j}. `))}
                        className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:border-brand"
                      >
                        + {j}
                      </button>
                    ))}
                  </div>
                )}
                <Field label={t.describeProblem} htmlFor="description" hint={t.describeHint}>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} />
                </Field>
                {relevantAssets.length > 0 && (
                  <Field label={t.appliance} htmlFor="asset">
                    <Select id="asset" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                      <option value="">{t.noAppliance}</option>
                      {relevantAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nickname}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label={t.photos} htmlFor="photos" hint={t.photosHint}>
                  <div>
                    <label htmlFor="photos" className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-ink hover:border-brand">
                      <Camera className="size-4" aria-hidden /> Add photos
                    </label>
                  </div>
                </Field>
                {photos.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {photos.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-white/70 bg-white/60 px-2.5 py-1.5 text-sm">
                        {f.name.slice(0, 28)}
                        <span className="text-ink-subtle">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-danger"
                        onClick={() => {
                          setPhotos([]);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                      >
                        <X className="size-4" aria-hidden /> Remove
                      </button>
                    </li>
                  </ul>
                )}
              </section>
            )}

            {step === 4 && category && (
              <section aria-labelledby="step-title" className="space-y-5">
                <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
                  {t.review}
                </h2>
                <div className="divide-y divide-line rounded-xl border border-white/70 bg-white/60">
                  {[
                    [t.stepService, category.name],
                    [t.stepAddress, mode === "property" ? `${property?.name}${isTenantMember ? "" : unitId ? `, ${property?.units.find((u) => u.id === unitId)?.label}` : ""}` : addressChoice === "new" ? `${address.line1}, ${coverage?.areaName} ${address.pincode}` : savedAddresses.find((a) => a.id === addressChoice)?.line1],
                    [t.stepTime, slotLabel(chosenSlot)],
                    [t.stepProblem, description.trim()],
                    ...(mode === "home" && occupancy === "TENANT"
                      ? [["Cost approval", costApproval === "LANDLORD" ? `Your landlord${selfLimit ? ` (you approve up to ₹${selfLimit})` : ""}` : "You"]]
                      : []),
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-6">
                      <span className="w-32 shrink-0 text-sm text-ink-muted">{k}</span>
                      <span className="min-w-0 break-words text-[15px] font-medium text-ink">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/70 bg-white/60 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-ink">{t.visitFee}</span>
                    <span className="font-display text-xl font-semibold tabular-nums">{formatMoney(category.visitFeePaise)}</span>
                  </div>
                  {formatMoneyRange(category.indicativeMinPaise, category.indicativeMaxPaise) && (
                    <div className="mt-2 flex items-baseline justify-between text-sm">
                      <span className="text-ink-muted">{t.indicative}</span>
                      <span className="font-semibold tabular-nums text-ink">{formatMoneyRange(category.indicativeMinPaise, category.indicativeMaxPaise)}</span>
                    </div>
                  )}
                  <p className="mt-2 text-sm text-ink-muted">{t.indicativeNote}</p>
                  {category.warrantyDays > 0 && <p className="mt-1 text-sm text-ink-muted">Workmanship warranty: {category.warrantyDays} days on the work done (exclusions apply).</p>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/70 bg-white/60 p-4">
                    <p className="text-sm font-semibold text-ink">{t.payment}</p>
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input type="radio" checked readOnly className="accent-brand" /> {t.payAfter}
                    </label>
                    <label className="mt-1.5 flex items-center gap-2 text-sm text-ink-subtle">
                      <input type="radio" disabled /> {t.payOnlineSoon}
                    </label>
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/60 p-4">
                    <p className="text-sm font-semibold text-ink">{t.cancellation}</p>
                    <p className="mt-2 text-sm text-ink-muted">{cancellationSummary}</p>
                  </div>
                </div>

                <Checkbox checked={acceptPolicy} onChange={(e) => setAcceptPolicy(e.target.checked)} label={t.accept} />
                {submitting && <BookingSubmitLoader label="Confirming your booking…" />}
              </section>
            )}
          </motion.div>
        </AnimatePresence>

        {/* File input stays mounted so selected photos survive step changes. */}
        <input
          ref={fileRef}
          id="photos"
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={step === 3 ? 0 : -1}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            setPhotos(files);
          }}
        />

        <div aria-live="assertive">
          {stepError && <p className="mt-5 text-sm font-semibold text-danger">{stepError}</p>}
          {state && !state.ok && !submitting && (
            <Alert tone="danger" className="mt-5" title="We couldn't book that">
              {state.error}
            </Alert>
          )}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-between gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            <ArrowLeft className="size-4" aria-hidden /> {t.back}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next} disabled={step === 1 && checking}>
              {t.next} <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={!acceptPolicy || submitting} aria-disabled={!acceptPolicy || submitting}>
              {submitting && <InlineButtonLoader />}
              {submitting ? t.submitting : t.submit}
            </Button>
          )}
        </div>
      </div>

      {/* Summary sidebar */}
      <aside className="hidden h-fit rounded-2xl border border-white/70 bg-white/60 p-5 lg:block" aria-label="Booking summary">
        {category ? (
          <>
            <div className="flex items-center gap-3">
              <ServiceTile icon={category.icon} size="sm" />
              <p className="font-bold text-ink">{category.name}</p>
            </div>
            <p className="mt-3 text-sm text-ink-muted">{category.shortDescription}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t.visitFee}</dt>
                <dd className="font-semibold">{formatMoney(category.visitFeePaise)}</dd>
              </div>
              {coverage?.status === "SERVED" && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Area</dt>
                  <dd className="font-semibold">{coverage.areaName}</dd>
                </div>
              )}
              {chosenSlot && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Window</dt>
                  <dd className="text-right font-semibold">{slotLabel(chosenSlot)}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Choose a service to see its visit fee.</p>
        )}
      </aside>
    </form>
  );
}
