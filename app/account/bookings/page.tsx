import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";
import { listCustomerBookings, listSharedBookings } from "@/features/bookings/queries";
import { BookingList } from "@/features/bookings/components/booking-list";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Bookings" };
const CLOSED = ["COMPLETED", "CANCELLED", "DECLINED"];

export default async function BookingsPage() {
  const [actor, dict] = await Promise.all([requireActor(), getDictionary()]);
  const db = await getDb();
  const [mine, shared] = await Promise.all([listCustomerBookings(db, actor), listSharedBookings(db, actor)]);
  const upcoming = mine.filter((b) => !CLOSED.includes(b.status));
  const history = mine.filter((b) => CLOSED.includes(b.status));
  return (
    <>
      <PageHeader title={dict.account.bookings} description="Every booking, its status and its full history." actions={<Link href="/book" className={buttonClass("primary", "md")}>{dict.nav.book}</Link>} />
      {mine.length === 0 && shared.length === 0 ? (
        <IllustratedEmpty scene="bookings" title="No bookings yet" body="When you book a service, its timeline, estimates and invoice will live here." action={{ href: "/book", label: dict.nav.book }} />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3" aria-labelledby="u">
            <h2 id="u" className="text-lg font-bold">
              {dict.account.upcoming} <span className="font-normal text-ink-subtle">({upcoming.length})</span>
            </h2>
            {upcoming.length ? <BookingList items={upcoming} hrefBase="/account/bookings" dict={dict} /> : <p className="text-sm text-ink-muted">Nothing in progress.</p>}
          </section>
          {shared.length > 0 && (
            <section className="space-y-3" aria-labelledby="s">
              <h2 id="s" className="text-lg font-bold">
                Shared with you
              </h2>
              <BookingList items={shared} hrefBase="/account/bookings" dict={dict} />
            </section>
          )}
          <section className="space-y-3" aria-labelledby="h">
            <h2 id="h" className="text-lg font-bold">
              {dict.account.history} <span className="font-normal text-ink-subtle">({history.length})</span>
            </h2>
            {history.length ? <BookingList items={history} hrefBase="/account/bookings" dict={dict} /> : <p className="text-sm text-ink-muted">Completed and cancelled bookings appear here.</p>}
          </section>
        </div>
      )}
    </>
  );
}
