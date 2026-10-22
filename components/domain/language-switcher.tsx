"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/lib/i18n/actions";
import { localeLabels, locales, type Locale } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** Switches interface language (navigation, home, booking flow, statuses, dashboards). */
export function LanguageSwitcher({ current, label, className }: { current: Locale; label: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Languages aria-hidden className="size-4 text-ink-subtle" />
      <label htmlFor="hc-language" className="sr-only">
        {label}
      </label>
      <select
        id="hc-language"
        value={current}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setLocale(e.target.value);
            router.refresh();
          })
        }
        className="h-9 cursor-pointer rounded-lg border-0 bg-transparent pr-1 text-sm font-semibold text-ink-muted hover:text-ink focus:ring-2 focus:ring-brand/30"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeLabels[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
