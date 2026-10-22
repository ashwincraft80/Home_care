import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <ContentPage title="Terms of service" legalDraft intro="Draft terms describing how the platform works today. Not legal advice; must be reviewed and completed by a lawyer before launch.">
      <section>
        <h2>The service</h2>
        <p>HomeCare connects customers with independent home-service professionals and records bookings, estimates, approvals, completion and invoices. Payment is made to the professional after service; online payment is not offered yet.</p>
      </section>
      <section>
        <h2>Pricing and approvals</h2>
        <p>Visit fees are shown before booking. Indicative ranges are not quotes. Additional work requires an approved itemised estimate; approved totals cannot be changed.</p>
      </section>
      <section>
        <h2>Cancellations</h2>
        <p>
          See the <Link href="/cancellation-policy" className="font-semibold text-brand underline">cancellation policy</Link>.
        </p>
      </section>
      <section>
        <h2>Workmanship warranty</h2>
        <p>Each service states its warranty period and exclusions. It covers the workmanship of that job only and does not replace any manufacturer warranty.</p>
      </section>
      <section>
        <h2>To be completed with counsel</h2>
        <ul>
          <li>Legal entity, liability limits and dispute resolution.</li>
          <li>Professional engagement terms (independent contractor terms, payouts, taxes).</li>
          <li>Consumer protection and e-commerce rule compliance.</li>
        </ul>
      </section>
    </ContentPage>
  );
}
