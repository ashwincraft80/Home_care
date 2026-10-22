import type { ComponentProps, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-[var(--radius-control)] border border-white/80 bg-white/70 px-4 text-[15px] text-ink shadow-[inset_0_1px_2px_rgb(19_36_31/0.06),0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-sm placeholder:text-ink-subtle transition-[border-color,box-shadow,background-color] focus:border-brand/60 focus:bg-white/90 focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-surface-muted aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        control,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234d5666%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-semibold text-ink", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | string[];
  children: ReactNode;
  className?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-subtle">
          {hint}
        </p>
      )}
      {children}
      {message && (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1.5 text-sm font-medium text-danger" role="alert">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          {message}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-[15px] leading-snug text-ink", className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-line-strong accent-brand" {...props} />
      <span>{label}</span>
    </label>
  );
}
