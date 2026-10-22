import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";

export const metadata: Metadata = { title: "Trust & safety" };

export default function TrustPage() {
  return (
    <ContentPage
      eyebrow="Trust & safety"
      title="What we promise — and what we don't."
      intro="Trust comes from being specific. These are the commitments built into every booking today, and the things we deliberately do not claim yet."
    >
      <section>
        <h2>What every booking includes</h2>
        <ul>
          <li>The visit fee before you book, and an itemised estimate before any extra work.</li>
          <li>Your explicit approval, recorded with your name and the time, before extra charges.</li>
          <li>A single timeline of every status change, who made it and when.</li>
          <li>Completion confirmed by you, not by the professional.</li>
          <li>An invoice with the workmanship warranty period and its exclusions.</li>
          <li>A complaint path you can track, with escalation.</li>
        </ul>
      </section>
      <section>
        <h2>What we don&apos;t claim</h2>
        <ul>
          <li>
            <strong>No blanket guarantee.</strong> Warranty covers the workmanship of a specific job for a stated period, with stated exclusions.
          </li>
          <li>
            <strong>No “verified” badge yet.</strong> Operations reviews each professional&apos;s profile, services and areas before they can take jobs. A third-party ID or background check isn&apos;t integrated yet, so we don&apos;t display one.
          </li>
          <li>
            <strong>No live tracking.</strong> You&apos;ll see when your professional sets off and your scheduled window, not a map we can&apos;t verify.
          </li>
          <li>
            <strong>No invented reviews or numbers.</strong> Ratings appear only after five reviews from completed bookings.
          </li>
        </ul>
      </section>
      <section>
        <h2>Your data</h2>
        <p>Professionals see your exact address only after they accept your job, and your phone number only while it&apos;s active. Landlords you invite see one booking. Tenants of a property only see their own unit. We don&apos;t send personal data to analytics.</p>
      </section>
      <section>
        <h2>Fair to professionals</h2>
        <p>
          Professionals see the area, window and guaranteed visit earnings before accepting. Declining never affects ranking, payouts are itemised, and they have their own dispute route. <Link href="/for-technicians" className="font-semibold text-brand underline">How it works for professionals</Link>.
        </p>
      </section>
      <section>
        <h2>Something went wrong?</h2>
        <p>
          Raise an issue from the booking or the <Link href="/support" className="font-semibold text-brand underline">support centre</Link>. For safety concerns, call support immediately.
        </p>
      </section>
    </ContentPage>
  );
}
