import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";
import { buttonClass } from "@/components/ui/button";
import { cancellationPolicy, completionPolicy } from "@/lib/config/site";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <ContentPage eyebrow="How it works" title="One booking, one timeline, no surprises." intro="Here is exactly what happens from the moment you book to the moment you confirm the work is done.">
      <section>
        <h2>1. Book</h2>
        <p>Enter your pincode, pick the service and a two-hour window, and describe the problem (tap a common issue to save typing). You see the visit fee and our cancellation terms before you confirm. Renting? Choose whether you or your landlord approves costs.</p>
      </section>
      <section>
        <h2>2. Confirmation and assignment</h2>
        <p>Operations confirms the booking and a professional who does that service in your area accepts it. You see their name and experience once assigned. Their phone number is shared only while the job is active.</p>
      </section>
      <section>
        <h2>3. Diagnosis and estimate</h2>
        <p>The professional inspects the problem. If more than the visit is needed, they send an itemised estimate — labour, parts with quantities, and any additional charges — with a validity period and exclusions.</p>
        <ul>
          <li>You approve or decline. Your name and the time are recorded.</li>
          <li>An approved estimate can never be edited. Extra work needs a separate estimate.</li>
          <li>If you decline, you pay only the visit fee.</li>
        </ul>
      </section>
      <section>
        <h2>4. Completion and confirmation</h2>
        <p>
          The professional records what they did and a short checklist. The job is <strong>not</strong> complete until you confirm it. If something isn&apos;t right, raise an issue instead and operations steps in. If you don&apos;t respond within {completionPolicy.autoConfirmAfterHours} hours, operations may close the job after review.
        </p>
      </section>
      <section>
        <h2>5. Invoice, warranty and your passport</h2>
        <p>Your invoice separates visit fee, labour, parts and extras, and states the workmanship warranty period and exclusions. The job is added to your home maintenance passport automatically.</p>
      </section>
      <section>
        <h2>Cancelling or rescheduling</h2>
        <p>{cancellationPolicy.summary} You can request a different window from the booking page; operations confirms it based on who is available.</p>
      </section>
      <Link href="/book" className={buttonClass("primary", "lg")}>
        Book a service
      </Link>
    </ContentPage>
  );
}
