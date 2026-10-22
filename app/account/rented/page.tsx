import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listMyProperties, listPropertyRequests, getPropertyDetail } from "@/features/properties/service";
import { listCustomerBookings } from "@/features/bookings/queries";
import { removePropertyMemberAction } from "@/features/account/actions";
import { BookingList } from "@/features/bookings/components/booking-list";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { buttonClass } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";
import type { PropertySummary } from "@/features/properties/service";
import type { Actor } from "@/types/domain";
import type { Database } from "@/lib/database/types";

export const metadata: Metadata = { title: "Rented home" };

export default async function RentedPage() {
  const actor = await requireActor();
  const db = await getDb();
  const [props, mine] = await Promise.all([listMyProperties(db, actor), listCustomerBookings(db, actor)]);
  const tenancies = props.filter((p) => p.memberRole === "TENANT");
  const rentedBookings = await db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string }>(`select id from bookings where customer_id = $1 and occupancy = 'TENANT' and property_id is null`, [actor.userId]),
  );
  const rentedIds = new Set(rentedBookings.map((r) => r.id));
  const personalRented = mine.filter((b) => rentedIds.has(b.id));

  return (
    <>
      <PageHeader
        title="Rented home"
        description="Request repairs without owning the home. Choose who approves costs, and keep proof of every job."
        actions={
          <Link href="/book" className={buttonClass("primary", "md")}>
            Request a repair
          </Link>
        }
      />
      {tenancies.length === 0 && personalRented.length === 0 && (
        <IllustratedEmpty
          scene="properties"
          title="No rented home linked yet"
          body="When you book, choose “I rent this home” — you can approve small repairs yourself and send a secure link to your landlord for the rest. If your landlord uses HomeCare, they can invite you to your flat."
          action={{ href: "/book", label: "Request a repair" }}
        />
      )}

      {tenancies.map((t) => (
        <TenancyCard key={t.id} tenancy={t} actor={actor} db={db} />
      ))}

      {personalRented.length > 0 && (
        <section className="space-y-3" aria-labelledby="pr">
          <h2 id="pr" className="flex items-center gap-2 text-lg font-bold">
            <KeyRound className="size-5 text-brand" aria-hidden /> Your rented-home bookings
          </h2>
          <BookingList items={personalRented} hrefBase="/account/bookings" />
          <p className="text-sm text-ink-muted">Each booking shows whether your landlord has joined and which estimates they still need to approve. Last updated {fmt.dateTime(new Date())}.</p>
        </section>
      )}
    </>
  );
}

async function TenancyCard({ tenancy: t, actor, db }: { tenancy: PropertySummary; actor: Actor; db: Database }) {
        const [detail, requests] = await Promise.all([getPropertyDetail(db, actor, t.id), listPropertyRequests(db, actor, { propertyId: t.id })]);
        const managers = (detail?.members ?? []).filter((m) => m.memberRole === "OWNER" || m.memberRole === "MANAGER");
        return (
          <Card key={t.id} className="mb-6">
            <CardHeader
              title={`${t.name} · ${t.tenantUnitLabel ?? "your unit"}`}
              description={`${t.line1}, ${t.locality}`}
              action={
                <Link href={`/book?property=${t.id}`} className={buttonClass("secondary", "sm")}>
                  Request for this flat
                </Link>
              }
            />
            <CardBody className="space-y-4">
              <Alert tone="info" title="Who pays for what">
                You can approve repairs up to {formatMoney(detail?.membership?.approvalLimitPaise ?? 0)} yourself. Anything above goes to {managers.map((m) => m.name).join(" or ") || "the property owner"} for approval.
              </Alert>
              {requests.length === 0 ? (
                <p className="text-sm text-ink-muted">No requests for your flat yet.</p>
              ) : (
                <BookingList
                  items={requests.map((r) => ({
                    ...r,
                    status: r.status as never,
                    categorySlug: "",
                    locality: t.locality,
                    technicianName: null,
                    visitFeePaise: 0,
                  }))}
                  hrefBase="/account/bookings"
                  showProperty
                />
              )}
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-ink-muted">Moved out? Leave this property</summary>
                <ActionForm action={removePropertyMemberAction as never} className="mt-3">
                  <input type="hidden" name="propertyId" value={t.id} />
                  <input type="hidden" name="profileId" value={actor.userId} />
                  <p className="text-ink-muted">You&apos;ll lose access to this flat&apos;s requests. Your own invoices stay in your account.</p>
                  <SubmitButton variant="danger" size="sm" pendingLabel="Leaving…">
                    Leave property
                  </SubmitButton>
                </ActionForm>
              </details>
            </CardBody>
          </Card>
        );
      }
