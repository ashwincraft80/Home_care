import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarPlus, Wrench } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";
import { listCustomerBookings, listNeedsAttention, listSharedBookings } from "@/features/bookings/queries";
import { listMyAssets, nextServiceSuggestion } from "@/features/assets/service";
import { BookingList } from "@/features/bookings/components/booking-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { fmt, localDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "My home" };

const ACTIVE = ["REQUESTED", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETION_PENDING", "RESCHEDULE_REQUESTED", "DISPUTED"];

export default async function AccountHome() {
  const [actor, dict] = await Promise.all([requireActor(), getDictionary()]);
  const db = await getDb();
  const [bookings, shared, attention, assets] = await Promise.all([
    listCustomerBookings(db, actor),
    listSharedBookings(db, actor),
    listNeedsAttention(db, actor),
    listMyAssets(db, actor),
  ]);
  const upcoming = bookings.filter((b) => ACTIVE.includes(b.status)).sort((a, b) => +new Date(a.slotStart) - +new Date(b.slotStart));
  const today = localDateKey(new Date());
  const reminders = assets
    .map((a) => ({ asset: a, s: nextServiceSuggestion(a, today) }))
    .filter((x) => x.s.nextServiceOn)
    .sort((a, b) => a.s.nextServiceOn!.localeCompare(b.s.nextServiceOn!))
    .slice(0, 4);
  const firstName = actor.name.replace(/\s*\(Demo\)$/, "").split(" ")[0];
  const isNew = bookings.length === 0 && shared.length === 0 && assets.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={`Hello, ${firstName}`}
        title={isNew ? dict.account.emptyTitle : "Your home at a glance"}
        actions={
          <Link href="/book" className={buttonClass("primary", "md")}>
            <CalendarPlus className="size-4" aria-hidden /> {dict.nav.book}
          </Link>
        }
      />

      {isNew ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <IllustratedEmpty scene="bookings" title="No bookings yet" body={dict.account.emptyBody} action={{ href: "/book", label: dict.nav.book }} />
          <IllustratedEmpty
            scene="assets"
            title="Start your home passport"
            body="Add your AC, geyser, RO or inverter. We'll suggest service dates from general guidance and keep every repair on record."
            action={{ href: "/account/assets/new", label: dict.account.addAppliance }}
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            {attention.length > 0 && (
              <section aria-labelledby="attn" className="space-y-3">
                <h2 id="attn" className="flex items-center gap-2 text-lg font-bold text-ink">
                  <BellRing className="size-5 text-warning" aria-hidden /> Needs your attention
                </h2>
                <BookingList items={attention} hrefBase="/account/bookings" dict={dict} />
              </section>
            )}
            <section aria-labelledby="up" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="up" className="text-lg font-bold text-ink">
                  {dict.account.upcoming}
                </h2>
                <Link href="/account/bookings" className="text-sm font-semibold text-brand hover:underline">
                  All bookings
                </Link>
              </div>
              {upcoming.length ? (
                <BookingList items={upcoming.slice(0, 5)} hrefBase="/account/bookings" dict={dict} />
              ) : (
                <IllustratedEmpty scene="bookings" title="Nothing scheduled" body="Book a visit whenever something needs attention." action={{ href: "/book", label: dict.nav.book }} />
              )}
            </section>
            {shared.length > 0 && (
              <section aria-labelledby="shared" className="space-y-3">
                <h2 id="shared" className="text-lg font-bold text-ink">
                  Shared with you
                </h2>
                <BookingList
                  items={shared.slice(0, 5)}
                  hrefBase="/account/bookings"
                  dict={dict}
                  extra={(b) => {
                    const s = b as (typeof shared)[number];
                    return <p className="mt-1 text-xs font-semibold text-ink-subtle">{s.sharedAs === "LANDLORD" ? `You approve costs for ${s.ownerName}` : `${s.ownerName}'s household booking`}</p>;
                  }}
                />
              </section>
            )}
          </div>
          <aside className="space-y-4">
            <Card>
              <CardHeader title="Maintenance reminders" description="Suggested from HomeCare's general service guidance." />
              <CardBody className="space-y-3">
                {reminders.length === 0 ? (
                  <p className="text-sm text-ink-muted">Add installation or service dates to your appliances to see suggestions here.</p>
                ) : (
                  reminders.map(({ asset, s }) => (
                    <Link key={asset.id} href={`/account/assets/${asset.id}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-muted">
                      <Wrench className="size-4 shrink-0 text-brand" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{asset.nickname}</p>
                        <p className={`text-xs ${s.overdue ? "font-semibold text-warning" : "text-ink-muted"}`}>
                          {s.overdue ? "Service suggested since" : "Next service around"} {fmt.date(s.nextServiceOn!)}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
                <p className="text-xs text-ink-subtle">Not a safety inspection. Follow your manufacturer&apos;s manual where it differs.</p>
              </CardBody>
            </Card>
            <Card className="p-5">
              <p className="font-bold text-ink">Home passport</p>
              <p className="mt-1 text-sm text-ink-muted">
                {assets.length} appliance{assets.length === 1 ? "" : "s"} on record · {bookings.filter((b) => b.status === "COMPLETED").length} completed job(s)
              </p>
              <Link href="/account/assets" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                Open passport <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Card>
            <Alert tone="info">Away during visits? Share bookings with a partner or family member from Household.</Alert>
          </aside>
        </div>
      )}
    </>
  );
}
