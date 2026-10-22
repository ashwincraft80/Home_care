/**
 * HomeCare loader & state-animation system.
 *
 * Every component here maps to a real interface state (see docs/product-decisions.md, "Motion").
 * They are pure SVG + CSS keyframes (no JS), announce themselves to assistive tech, never delay
 * content, and become static under prefers-reduced-motion (globals.css).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const anim = (name: string, ms: number, delay = 0, extra = "") =>
  ({ animation: `${name} ${ms}ms var(--ease-out-soft) ${delay}ms ${extra}`.trim() }) as React.CSSProperties;

function Status({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center justify-center gap-3 text-center", className)}>
      {children}
      <p className="text-sm font-medium text-ink-muted">{label}</p>
    </div>
  );
}

/** A small house that assembles: foundation, walls, roof, warm light. Used for route-level loading. */
export function HomeAssemblyLoader({ label = "Getting things ready…", className }: { label?: string; className?: string }) {
  return (
    <Status label={label} className={className}>
      <svg width="64" height="56" viewBox="0 0 64 56" aria-hidden>
        <rect x="10" y="48" width="44" height="4" rx="2" fill="var(--color-line-strong)" style={anim("hc-assemble", 500, 0, "both")} />
        <rect x="16" y="26" width="32" height="22" rx="2" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" style={anim("hc-assemble", 500, 120, "both")} />
        <path d="M10 28 32 10l22 18" fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={anim("hc-assemble", 500, 260, "both")} />
        <rect x="27" y="34" width="10" height="14" rx="1.5" fill="var(--color-sun)" style={{ ...anim("hc-assemble", 400, 420, "both"), animationName: "hc-assemble, hc-pulse-soft", animationDuration: "400ms, 1600ms", animationDelay: "420ms, 900ms", animationIterationCount: "1, infinite" }} />
      </svg>
    </Status>
  );
}

/** Scanning light across a house silhouette — used while loading home records / passport. */
export function HomeScanLoader({ label = "Getting your home ready…", className }: { label?: string; className?: string }) {
  return (
    <Status label={label} className={className}>
      <div className="relative h-14 w-20 overflow-hidden">
        <svg width="80" height="56" viewBox="0 0 80 56" aria-hidden className="absolute inset-0">
          <path d="M12 26 40 6l28 20v26H12z" fill="var(--color-sage-soft)" stroke="var(--color-sage)" strokeWidth="2" strokeLinejoin="round" />
          <rect x="34" y="34" width="12" height="18" rx="1.5" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        </svg>
        <div className="absolute inset-y-0 w-6 bg-gradient-to-r from-transparent via-white/90 to-transparent" style={anim("hc-scan", 1400, 0, "infinite")} />
      </div>
    </Status>
  );
}

/** Compact inline spinner for buttons. */
export function InlineButtonLoader({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin motion-reduce:animate-none", className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Shown inside the confirm step while the booking request is in flight. */
export function BookingSubmitLoader({ label = "Confirming your booking…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-ink">
      <svg width="28" height="24" viewBox="0 0 28 24" aria-hidden>
        <path d="M3 12 14 3l11 9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 30, ...anim("hc-draw", 900, 0, "infinite alternate") }} />
        <rect x="7" y="12" width="14" height="10" rx="1.5" fill="currentColor" opacity="0.25" />
      </svg>
      {label}
    </div>
  );
}

/** Booking is confirmed and operations/technicians are being matched (status CONFIRMED, no technician). */
export function TechnicianAssignmentAnimation({ label = "Finding an available professional…" }: { label?: string }) {
  return (
    <Status label={label}>
      <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden>
        <circle cx="12" cy="20" r="6" fill="var(--color-brand)" />
        <path d="M18 20h36" stroke="var(--color-sage)" strokeWidth="2.5" strokeDasharray="4 4" style={anim("hc-route", 900, 0, "linear infinite")} />
        <circle cx="60" cy="20" r="8" fill="none" stroke="var(--color-brand)" strokeWidth="2.5" style={anim("hc-pulse-soft", 1400, 0, "infinite")} />
      </svg>
    </Status>
  );
}

/**
 * Technician is travelling. We do NOT have live location tracking, so this shows the
 * scheduled window — never a fake map or ETA.
 */
export function TechnicianEnRouteAnimation({ windowLabel }: { windowLabel: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-muted px-4 py-3">
      <svg width="56" height="28" viewBox="0 0 56 28" aria-hidden className="shrink-0">
        <path d="M4 22h48" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" />
        <path d="M4 22h48" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 42" style={anim("hc-route", 1600, 0, "linear infinite")} />
        <path d="M42 22V12l6-5 6 5v10" fill="var(--color-sage-soft)" stroke="var(--color-sage)" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <p className="text-sm text-ink-muted">
        <span className="font-semibold text-ink">On the way.</span> Expected within your window: {windowLabel}. Live tracking isn&apos;t available yet.
      </p>
    </div>
  );
}

/** Work is in progress at the home. */
export function ServiceInProgressAnimation() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <circle cx="20" cy="20" r="17" fill="var(--color-brand-soft)" />
      <path d="M14 26l9-9m-2-3 5 5m-11 8-3 1 1-3" stroke="var(--color-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={anim("hc-pulse-soft", 1600, 0, "infinite")} />
    </svg>
  );
}

/** Shown only after the backend confirms completion. A small check with a warm glow. */
export function CompletionCelebration({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-4 rounded-xl border border-[#c8e4d1] bg-success-soft px-4 py-4">
      <div className="relative size-11 shrink-0">
        <span className="absolute inset-0 rounded-full bg-sun" style={anim("hc-glow", 1400, 0, "both")} />
        <svg viewBox="0 0 44 44" className="relative size-11" aria-hidden>
          <circle cx="22" cy="22" r="20" fill="var(--color-success)" />
          <path d="M13 22.5 19.5 29 31 16" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 30, ...anim("hc-draw", 500, 150, "both") }} />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-[#115430]">{title}</p>
        {body && <div className="text-sm text-[#115430]/85">{body}</div>}
      </div>
    </div>
  );
}
