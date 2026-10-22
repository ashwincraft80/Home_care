import type { Metadata } from "next";
import { ContentPage } from "@/components/domain/content-page";
import { cancellationPolicy } from "@/lib/config/site";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Cancellation policy" };

export default function CancellationPolicyPage() {
  return (
    <ContentPage title="Cancellation & rescheduling" legalDraft intro={cancellationPolicy.summary}>
      <section>
        <h2>For customers</h2>
        <ul>
          <li>Free to cancel while your request is awaiting confirmation.</li>
          <li>Free to cancel at least {cancellationPolicy.freeCancellationHoursBefore} hours before your window starts.</li>
          <li>A {formatMoney(cancellationPolicy.lateCancellationFeePaise)} fee applies inside that period or once the professional is on the way. The fee is shown before you confirm the cancellation.</li>
          <li>Rescheduling is a request; your original window stays until operations confirms the new one.</li>
        </ul>
      </section>
      <section>
        <h2>For professionals</h2>
        <p>Professionals can hand back an accepted job before setting off. It&apos;s recorded for operations; there is no automatic penalty.</p>
      </section>
    </ContentPage>
  );
}
