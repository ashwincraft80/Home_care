import type { Metadata } from "next";
import { ContentPage } from "@/components/domain/content-page";
import { site } from "@/lib/config/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy policy" legalDraft intro="This is a plain-language draft describing how this software handles data. It must be reviewed by a qualified lawyer (including for India's Digital Personal Data Protection Act, 2023) before any public launch.">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account: name, email and/or phone.</li>
          <li>Bookings: service address, problem description, optional photos, appointment window.</li>
          <li>Home passport: appliances and documents you choose to add.</li>
          <li>Professionals: profile, services, areas, availability and payout records.</li>
          <li>Product analytics: anonymous events (e.g. “booking started”) with no names, numbers or addresses.</li>
        </ul>
      </section>
      <section>
        <h2>Who sees what</h2>
        <ul>
          <li>Assigned professionals see your exact address after accepting, and your phone only while the job is active.</li>
          <li>Landlords you invite see only that booking. Tenants of managed properties see only their own unit.</li>
          <li>Household members you invite see your personal bookings and passport.</li>
          <li>Operations staff can see records needed to run and audit the service.</li>
        </ul>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>You can request deletion from your profile. Some records (invoices, job and audit history) may need to be kept for legal, tax or dispute purposes; retention periods are to be defined with legal counsel.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          {site.contact.supportEmail} · {site.contact.registeredAddress}
        </p>
      </section>
    </ContentPage>
  );
}
