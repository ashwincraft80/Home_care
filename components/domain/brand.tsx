import Link from "next/link";
import {
  AirVent,
  BatteryCharging,
  Droplets,
  GlassWater,
  Hammer,
  SolarPanel,
  WashingMachine,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { site } from "@/lib/config/site";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/surface";
import type { BookingStatus } from "@/types/domain";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Logo mark: a roof line over a check — "taken care of". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-brand)" />
      <path d="M7.5 15.5 16 8.5l8.5 7" fill="none" stroke="#fffefb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m11.5 18.8 3.2 3.2 6-6.2" fill="none" stroke="var(--color-sun)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-lg", className)} aria-label={`${site.brand.name} home`}>
      <LogoMark />
      <span className="font-display text-[21px] font-semibold tracking-tight text-ink">{site.brand.shortName}</span>
    </Link>
  );
}

export const serviceIcons: Record<string, LucideIcon> = {
  electrician: Zap,
  plumbing: Droplets,
  ac: AirVent,
  appliance: WashingMachine,
  ro: GlassWater,
  inverter: BatteryCharging,
  solar: SolarPanel,
  general: Hammer,
};

export function ServiceIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = serviceIcons[icon] ?? Hammer;
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
}

/** Icon in a soft tile — the consistent visual anchor for service categories. */
export function ServiceTile({ icon, size = "md" }: { icon: string; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "size-9 rounded-lg [&>svg]:size-[18px]", md: "size-11 rounded-xl [&>svg]:size-[22px]", lg: "size-14 rounded-2xl [&>svg]:size-7" }[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-[linear-gradient(160deg,rgb(255_255_255/0.95),rgb(225_238_230/0.85))] text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255),inset_0_0_0_1px_rgb(138_165_150/0.25),0_6px_14px_-8px_rgb(13_107_98/0.45)]",
        s,
      )}
    >
      <ServiceIcon icon={icon} />
    </span>
  );
}

const statusTone: Record<BookingStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "info"> = {
  REQUESTED: "neutral",
  CONFIRMED: "info",
  ASSIGNED: "brand",
  EN_ROUTE: "brand",
  IN_PROGRESS: "brand",
  AWAITING_APPROVAL: "warning",
  COMPLETION_PENDING: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  DECLINED: "neutral",
  RESCHEDULE_REQUESTED: "warning",
  DISPUTED: "danger",
};

export function StatusBadge({ status, dict }: { status: BookingStatus; dict?: Dictionary }) {
  return <Badge tone={statusTone[status]}>{dict?.status[status] ?? status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export const statusLabelEn: Record<BookingStatus, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  ASSIGNED: "Professional assigned",
  EN_ROUTE: "On the way",
  IN_PROGRESS: "In progress",
  AWAITING_APPROVAL: "Estimate awaiting approval",
  COMPLETION_PENDING: "Awaiting confirmation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DECLINED: "Declined",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  DISPUTED: "Issue raised",
};
