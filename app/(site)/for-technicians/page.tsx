import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";
import { buttonClass } from "@/components/ui/button";
import { payoutPolicy } from "@/lib/config/site";

export const metadata: Metadata = { title: "For professionals" };

export default function ForTechnicians() {
  return (
    <ContentPage eyebrow="For professionals" title="Know the job and the pay before you say yes." intro="HomeCare is built to be fair to the people doing the work. Here's how jobs, pay and disputes work.">
      <section>
        <h2>Jobs you can actually plan for</h2>
        <ul>
          <li>You choose your services, areas and weekly availability.</li>
          <li>Each offer shows the area, time window, problem description and your guaranteed visit earnings.</li>
          <li>Decline any offer without penalty. The full address is shared after you accept.</li>
          <li>Can&apos;t make it? Hand the job back before you set off; it&apos;s recorded, not penalised automatically.</li>
        </ul>
      </section>
      <section>
        <h2>Transparent earnings</h2>
        <p>
          {payoutPolicy.summary} Payout cycle: {payoutPolicy.payoutCycle}. Every payout shows its breakdown, and you can raise a payout dispute from the app.
        </p>
      </section>
      <section>
        <h2>Estimates protect you too</h2>
        <p>Send an itemised estimate from your phone. Once the customer approves, it&apos;s locked — no arguments at the door about what was agreed.</p>
      </section>
      <section>
        <h2>Ratings that mean something</h2>
        <p>Your rating is shown only after five reviews from completed jobs. Operations reviews complaints with both sides before acting.</p>
      </section>
      <section>
        <h2>Joining</h2>
        <p>Create an account as a professional, complete your profile, and operations will review it. We currently work in a small set of areas; we&apos;ll tell you honestly if we can&apos;t offer work where you are yet.</p>
      </section>
      <Link href="/signup?as=technician" className={buttonClass("primary", "lg")}>
        Apply as a professional
      </Link>
    </ContentPage>
  );
}
