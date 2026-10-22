import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.005em] transition-[background-color,box-shadow,transform,color] duration-200 ease-[var(--ease-out-soft)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 whitespace-nowrap select-none";

const variants: Record<Variant, string> = {
  primary:
    "text-white bg-[linear-gradient(180deg,#15867b_0%,#0d6b62_55%,#0b5d55_100%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.15),0_10px_24px_-12px_rgb(13_107_98/0.7)] hover:brightness-[1.06] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.32),0_14px_30px_-12px_rgb(13_107_98/0.75)]",
  secondary:
    "text-ink bg-white/60 border border-white/80 backdrop-blur-md shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_6px_18px_-12px_rgb(40_52_45/0.35)] hover:bg-white/80",
  ghost: "text-ink-muted hover:text-ink hover:bg-white/55",
  subtle: "bg-brand-soft/80 text-brand-ink hover:bg-brand-soft",
  danger: "text-danger bg-white/60 border border-[#efc7c2] backdrop-blur-md hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-[52px] px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
