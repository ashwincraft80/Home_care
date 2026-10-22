import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "./brand";
import { DemoBanner } from "./site-chrome";
import { LanguageSwitcher } from "./language-switcher";
import { WorkspaceNav } from "./workspace-nav";
import { signOutAction } from "@/lib/auth/actions";
import { markNotificationsReadAction } from "@/features/notifications/actions";
import { listNotifications, unreadCount } from "@/features/notifications/service";
import { getDb } from "@/lib/database";
import { isDemoMode } from "@/lib/config/env";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { fmt } from "@/lib/time";
import type { Actor } from "@/types/domain";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const workspaces = [
  { href: "/account", label: "My home", role: "CUSTOMER" },
  { href: "/pm", label: "Properties", role: "PROPERTY_MANAGER" },
  { href: "/tech", label: "Jobs", role: "TECHNICIAN" },
  { href: "/admin", label: "Operations", role: "ADMIN" },
] as const;

async function NotificationsMenu({ actor }: { actor: Actor }) {
  const db = await getDb();
  const [items, unread] = await Promise.all([listNotifications(db, actor, 12), unreadCount(db, actor)]);
  return (
    <details className="group relative">
      <summary className="relative flex size-10 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread}</span>}
      </summary>
      <div className="absolute right-0 top-12 z-50 w-[min(92vw,360px)] rounded-2xl glass-strong">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-bold text-ink">Notifications</p>
          {unread > 0 && (
            <form action={markNotificationsReadAction}>
              <button className="text-sm font-semibold text-brand hover:underline">Mark all read</button>
            </form>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">No notifications yet. Booking updates will appear here.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.map((n) => {
              const body = (
                <>
                  <p className={`text-sm ${n.readAt ? "text-ink-muted" : "font-semibold text-ink"}`}>{n.title}</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{fmt.dateTime(n.createdAt)}</p>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block px-4 py-3 hover:bg-surface-muted">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-subtle">SMS, email and WhatsApp alerts aren&apos;t connected yet — updates appear here.</p>
      </div>
    </details>
  );
}

export async function WorkspaceShell({ actor, title, nav, children }: { actor: Actor; title: string; nav: NavItem[]; children: React.ReactNode }) {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const mine = workspaces.filter((w) => actor.roles.includes(w.role));
  return (
    <div className="min-h-dvh">
      {isDemoMode() && <DemoBanner dict={dict} />}
      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
            <span className="hidden text-sm font-bold text-ink-muted sm:block">{title}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {mine.length > 1 && (
              <nav aria-label="Workspaces" className="hidden items-center gap-1 rounded-xl bg-surface-muted p-1 md:flex">
                {mine.map((w) => (
                  <Link key={w.href} href={w.href} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink">
                    {w.label}
                  </Link>
                ))}
              </nav>
            )}
            <LanguageSwitcher current={locale} label={dict.nav.language} className="hidden lg:inline-flex" />
            <NotificationsMenu actor={actor} />
            <details className="relative">
              <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted" aria-label="Account menu">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{actor.name.charAt(0)}</span>
                <span className="hidden max-w-40 truncate text-sm font-semibold text-ink sm:block">{actor.name}</span>
              </summary>
              <div className="absolute right-0 top-12 z-50 w-60 rounded-2xl glass-strong p-2">
                {mine.map((w) => (
                  <Link key={w.href} href={w.href} className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted md:hidden">
                    {w.label}
                  </Link>
                ))}
                <Link href="/" className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted">
                  HomeCare website
                </Link>
                <form action={signOutAction}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-danger-soft">
                    <LogOut className="size-4" aria-hidden /> {dict.nav.signOut}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:pt-8">
        <WorkspaceNav items={nav.map(({ icon: Icon, ...rest }) => ({ ...rest, icon: <Icon className="size-[18px]" aria-hidden /> }))} />
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
