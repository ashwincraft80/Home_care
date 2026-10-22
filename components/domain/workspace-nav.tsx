"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function WorkspaceNav({ items }: { items: { href: string; label: string; icon: ReactNode; exact?: boolean }[] }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <>
      <nav aria-label="Section" className="sticky top-24 hidden h-fit lg:block">
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active(i.href, i.exact) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-semibold transition-colors",
                  active(i.href, i.exact) ? "glass text-ink" : "text-ink-muted hover:bg-white/50 hover:text-ink",
                )}
              >
                <span className={active(i.href, i.exact) ? "text-brand" : ""}>{i.icon}</span>
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Section" className="-mx-4 -mt-2 overflow-x-auto border-b border-line px-4 lg:hidden">
        <ul className="flex gap-1 pb-2">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active(i.href, i.exact) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold",
                  active(i.href, i.exact) ? "glass text-brand-ink" : "text-ink-muted",
                )}
              >
                {i.icon}
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
