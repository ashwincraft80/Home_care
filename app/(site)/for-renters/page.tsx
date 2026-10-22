import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "For tenants & students" };

export default function ForRenters() {
  return (
    <ContentPage eyebrow="Tenants & students" title="You don't need to own the home to get it fixed." intro="Book repairs for your flat or shared room, decide who approves the cost, and keep the invoice as proof.">
      <section>
        <h2>How it works when you rent</h2>
        <ul>
          <li>Choose “I rent this home” when you book and enter your flat details.</li>
          <li>Decide who approves costs: you, or your landlord.</li>
          <li>Set a small amount you&apos;re happy to approve and pay yourself — anything above it waits for your landlord.</li>
          <li>Send your landlord a secure, single-use link. They see only this booking.</li>
          <li>Track the request, the approval status and the final invoice in one place.</li>
        </ul>
      </section>
      <section>
        <h2>Who pays is always clear</h2>
        <p>Each approved estimate records who approved it and who is responsible for paying. Your invoice shows it too — useful for deposits and reimbursements.</p>
      </section>
      <section>
        <h2>Only what we need</h2>
        <p>We ask for your name, phone and the service address. We never ask students or tenants for ID documents or rental agreements to book a repair.</p>
      </section>
      <section>
        <h2>Shared flat?</h2>
        <p>Book for the flat and share the booking with flatmates through Household, so whoever is home can let the professional in.</p>
      </section>
      <Link href="/book" className={buttonClass("primary", "lg")}>
        Request a repair
      </Link>
    </ContentPage>
  );
}
