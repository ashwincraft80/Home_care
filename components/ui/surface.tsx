import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] glass glass-sheen", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-ink/[0.06] px-5 py-4 sm:px-6", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted ring-line",
  brand: "bg-brand-soft text-brand-ink ring-[#c4e0d9]",
  success: "bg-success-soft text-success ring-[#c8e4d1]",
  warning: "bg-warning-soft text-warning ring-[#f1dcb4]",
  danger: "bg-danger-soft text-danger ring-[#f3cbc6]",
  info: "bg-info-soft text-info ring-[#cfdbf7]",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;
const alertTones = {
  info: "bg-info-soft/80 border-white/70 text-[#1b3d86] backdrop-blur-md",
  success: "bg-success-soft/85 border-white/70 text-[#115430] backdrop-blur-md",
  warning: "bg-warning-soft/85 border-white/70 text-[#7a4705] backdrop-blur-md",
  danger: "bg-danger-soft/85 border-white/70 text-[#8f1c13] backdrop-blur-md",
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-[inset_0_1px_0_rgb(255_255_255/0.7)]", alertTones[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass glass-sheen flex flex-col items-center rounded-[var(--radius-card)] px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-[15px] text-ink-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-sunken", className)} />;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm font-semibold text-brand">{eyebrow}</div>}
        <h1 className="font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] text-ink sm:text-[36px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function DescriptionList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6">
          <dt className="w-44 shrink-0 text-sm text-ink-muted">{item.label}</dt>
          <dd className="min-w-0 text-[15px] font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
