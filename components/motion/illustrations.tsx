import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";

type Scene = "bookings" | "technicians" | "assets" | "history" | "invoices" | "notifications" | "properties" | "search" | "household";

/** Small, calm line illustrations for empty states. One visual language, varied by scene. */
export function EmptyStateIllustration({ scene, className }: { scene: Scene; className?: string }) {
  const detail: Record<Scene, ReactNode> = {
    bookings: (
      <>
        <rect x="60" y="34" width="40" height="34" rx="4" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M60 44h40M70 30v8M90 30v8" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" />
        <path d="M72 55l5 5 10-10" stroke="var(--color-brand)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    technicians: (
      <>
        <circle cx="80" cy="40" r="9" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M64 68c2-10 9-15 16-15s14 5 16 15" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M100 32h10M105 27v10" stroke="var(--color-sun)" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
    assets: (
      <>
        <rect x="58" y="34" width="44" height="18" rx="4" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M64 46h32M66 58v6M80 58v8M94 58v6" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="96" cy="40" r="2" fill="var(--color-brand)" />
      </>
    ),
    history: (
      <>
        <rect x="62" y="28" width="36" height="44" rx="4" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M70 40h20M70 49h20M70 58h12" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="96" cy="64" r="9" fill="var(--color-brand-soft)" stroke="var(--color-brand)" strokeWidth="2" />
        <path d="M96 60v4l3 2" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    invoices: (
      <>
        <path d="M64 28h32v44l-5-3-5 3-5-3-5 3-5-3-7 3z" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M71 40h18M71 48h18M71 56h10" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    notifications: (
      <>
        <path d="M68 58V46a12 12 0 0 1 24 0v12l4 5H64z" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M76 67a4 4 0 0 0 8 0" stroke="var(--color-sage)" strokeWidth="2" />
      </>
    ),
    properties: (
      <>
        <rect x="58" y="32" width="22" height="38" rx="2" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <rect x="84" y="44" width="20" height="26" rx="2" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M64 40h4m4 0h4M64 50h4m4 0h4M64 60h4m4 0h4M90 52h3m4 0h3" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    search: (
      <>
        <circle cx="76" cy="46" r="13" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="m86 56 10 10" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
    household: (
      <>
        <circle cx="70" cy="42" r="7" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <circle cx="92" cy="42" r="7" fill="var(--color-surface)" stroke="var(--color-sage)" strokeWidth="2" />
        <path d="M58 66c1-8 6-12 12-12s11 4 12 12M80 66c1-8 6-12 12-12s11 4 12 12" fill="none" stroke="var(--color-sage)" strokeWidth="2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 160 96" className={cn("h-24 w-40", className)} aria-hidden>
      <ellipse cx="80" cy="80" rx="54" ry="6" fill="var(--color-surface-sunken)" />
      <circle cx="80" cy="50" r="34" fill="var(--color-sage-soft)" />
      {detail[scene]}
    </svg>
  );
}

export function ErrorStateIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" className={cn("h-24 w-40", className)} aria-hidden>
      <ellipse cx="80" cy="82" rx="50" ry="6" fill="var(--color-surface-sunken)" />
      <path d="M50 46 80 22l30 24v32H50z" fill="var(--color-surface)" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M74 78V60h12v18" fill="var(--color-sun-soft)" stroke="var(--color-line-strong)" strokeWidth="2" />
      <path d="M104 26l8 8m0-8-8 8" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Empty state with illustration and one meaningful next action. */
export function IllustratedEmpty({
  scene,
  title,
  body,
  action,
  className,
}: {
  scene: Scene;
  title: string;
  body?: ReactNode;
  action?: { href: string; label: string } | ReactNode;
  className?: string;
}) {
  const isLink = action && typeof action === "object" && "href" in (action as object);
  return (
    <div className={cn("glass glass-sheen flex flex-col items-center rounded-[var(--radius-card)] px-6 py-10 text-center", className)}>
      <EmptyStateIllustration scene={scene} />
      <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-[15px] text-ink-muted">{body}</p>}
      {action && (
        <div className="mt-5">
          {isLink ? (
            <Link href={(action as { href: string }).href} className={buttonClass("primary", "md")}>
              {(action as { label: string }).label}
            </Link>
          ) : (
            (action as ReactNode)
          )}
        </div>
      )}
    </div>
  );
}
