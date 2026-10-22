import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "For landlords & property managers" };

export default function ForPropertyManagers() {
  return (
    <ContentPage eyebrow="Landlords & property managers" title="Every unit's maintenance, approved on your terms." intro="Manage requests across properties and units, decide who can approve what, and keep a clean record of every job and invoice.">
      <section>
        <h2>Built around approvals</h2>
        <ul>
          <li>Set an approval limit for each co-manager and each tenant.</li>
          <li>Estimates above someone&apos;s limit wait for you — work doesn&apos;t start without the right approval.</li>
          <li>Every approval records who approved, when, for how much, and who pays.</li>
        </ul>
      </section>
      <section>
        <h2>Tenants without the chaos</h2>
        <ul>
          <li>Invite tenants to their unit with a single-use link.</li>
          <li>Tenants raise requests for their own flat and see only their own unit — never other tenants.</li>
          <li>Remove a tenant when they move out; their access ends immediately.</li>
          <li>Not using HomeCare for the property? Tenants can still send you a secure link to approve one booking.</li>
        </ul>
      </section>
      <section>
        <h2>Records you can use</h2>
        <p>See requests by unit, a monthly summary of requests, completed jobs and spend, invoices by property, and an appliance passport for geysers, solar systems and more.</p>
      </section>
      <Link href="/signup?as=property_manager" className={buttonClass("primary", "lg")}>
        Manage a property
      </Link>
    </ContentPage>
  );
}
