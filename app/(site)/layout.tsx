import { DemoBanner, SiteFooter, SiteHeader } from "@/components/domain/site-chrome";
import { getActor } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config/env";
import { getDictionary, getLocale } from "@/lib/i18n/server";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [dict, locale, actor] = await Promise.all([getDictionary(), getLocale(), getActor()]);
  return (
    <div className="flex min-h-dvh flex-col">
      {isDemoMode() && <DemoBanner dict={dict} />}
      <SiteHeader dict={dict} locale={locale} actor={actor} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
