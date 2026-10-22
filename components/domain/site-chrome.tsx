import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "./brand";
import { LanguageSwitcher } from "./language-switcher";
import { buttonClass } from "@/components/ui/button";
import { site } from "@/lib/config/site";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import type { Actor } from "@/types/domain";
import { homePathFor } from "@/lib/auth/actor";

export function DemoBanner({ dict }: { dict: Dictionary }) {
  return (
    <div className="border-b border-white/60 bg-warning-soft/75 px-4 py-1.5 text-center text-[13px] font-semibold text-[#7a4705] backdrop-blur-md">
      {dict.common.demoBanner}{" "}
      <Link href="/login" className="underline underline-offset-2">
        Switch demo persona
      </Link>
    </div>
  );
}

export function SiteHeader({ dict, locale, actor }: { dict: Dictionary; locale: Locale; actor: Actor | null }) {
  const nav = [
    { href: "/services", label: dict.nav.services },
    { href: "/how-it-works", label: dict.nav.howItWorks },
    { href: actor ? homePathFor(actor) : "/my-home", label: dict.nav.myHome },
    { href: "/trust-and-safety", label: dict.nav.trust },
  ];
  return (
    <header className="sticky top-3 z-40 px-3 pt-3 sm:px-4">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">
        Skip to content
      </a>
      <div className="glass-strong mx-auto flex h-[60px] max-w-[76rem] items-center justify-between gap-4 rounded-full pl-5 pr-2">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-white/70 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher current={locale} label={dict.nav.language} className="hidden sm:inline-flex" />
          {actor ? (
            <Link href={homePathFor(actor)} className={buttonClass("secondary", "sm", "hidden sm:inline-flex")}>
              {dict.nav.dashboard}
            </Link>
          ) : (
            <Link href="/login" className={buttonClass("ghost", "sm", "hidden sm:inline-flex")}>
              {dict.nav.signIn}
            </Link>
          )}
          <Link href="/book" className={buttonClass("primary", "sm")}>
            {dict.nav.book}
          </Link>
          <details className="group relative lg:hidden">
            <summary className="flex size-10 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-white/70" aria-label="Open menu">
              <Menu className="size-5 group-open:hidden" aria-hidden />
              <X className="hidden size-5 group-open:block" aria-hidden />
            </summary>
            <div className="glass-strong absolute right-0 top-14 w-64 rounded-3xl p-2">
              <nav aria-label="Mobile">
                {[...nav, { href: "/for-property-managers", label: dict.nav.forProperties }, { href: "/for-technicians", label: dict.nav.forTechnicians }, { href: "/faq", label: dict.nav.help }].map((n) => (
                  <Link key={n.href + n.label} href={n.href} className="block rounded-lg px-3 py-2.5 text-[15px] font-semibold text-ink hover:bg-surface-muted">
                    {n.label}
                  </Link>
                ))}
                <Link href={actor ? homePathFor(actor) : "/login"} className="block rounded-lg px-3 py-2.5 text-[15px] font-semibold text-brand hover:bg-surface-muted">
                  {actor ? dict.nav.dashboard : dict.nav.signIn}
                </Link>
              </nav>
              <div className="mt-1 border-t border-line px-2 pt-2">
                <LanguageSwitcher current={locale} label={dict.nav.language} />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const cols = [
    {
      title: "Services",
      links: [
        { href: "/services", label: "All services" },
        { href: "/book", label: "Book a service" },
        { href: "/coverage", label: "Where we serve" },
        { href: "/how-it-works", label: "How it works" },
      ],
    },
    {
      title: "For you",
      links: [
        { href: "/for-renters", label: "Tenants & students" },
        { href: "/for-property-managers", label: "Landlords & property managers" },
        { href: "/for-technicians", label: "Professionals" },
        { href: "/my-home", label: "Home maintenance passport" },
      ],
    },
    {
      title: "Trust",
      links: [
        { href: "/trust-and-safety", label: "Trust & safety" },
        { href: "/cancellation-policy", label: "Cancellation policy" },
        { href: "/terms", label: "Terms of service" },
        { href: "/privacy", label: "Privacy policy" },
      ],
    },
    {
      title: "Help",
      links: [
        { href: "/faq", label: "FAQ" },
        { href: "/contact", label: "Contact & support" },
        { href: "/support", label: "Raise a complaint" },
      ],
    },
  ];
  return (
    <footer className="mt-24 border-t border-white/70 bg-white/40 backdrop-blur-xl">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">{site.brand.tagline} {site.brand.supporting}</p>
          <p className="mt-4 text-sm text-ink-muted">
            Support: {site.contact.supportHours}
            <br />
            <a className="font-semibold text-ink underline-offset-2 hover:underline" href={`mailto:${site.contact.supportEmail}`}>
              {site.contact.supportEmail}
            </a>
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="text-sm font-bold text-ink">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink-muted hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.brand.name}. {site.contact.registeredAddress}.
          </p>
          <p>Prices in INR. GST treatment pending accountant review.</p>
        </div>
      </div>
    </footer>
  );
}

/** Mobile-only bottom bar keeping the booking CTA in reach without covering content. */
export function MobileBookBar({ label }: { label: string }) {
  return (
    <div className="glass-bar fixed inset-x-0 bottom-0 z-30 border-t border-white/70 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:hidden">
      <Link href="/book" className={buttonClass("primary", "lg", "w-full")}>
        {label}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
