import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/domain/content-page";
import { buttonClass } from "@/components/ui/button";
import { getActor } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/actor";

export const metadata: Metadata = { title: "Home maintenance passport" };

export default async function MyHomePage() {
  const actor = await getActor();
  return (
    <ContentPage eyebrow="My home" title="A record of every repair, in one place." intro="Your home maintenance passport keeps appliances, warranties and service history together — useful when something breaks again, when you sell or let the home, or when you just can't remember when the AC was last serviced.">
      <section>
        <h2>What it stores</h2>
        <ul>
          <li>Appliances and systems — AC, geyser, RO, inverter, rooftop solar — with optional brand, model and installation date.</li>
          <li>Warranty end dates and uploaded warranty cards or purchase invoices (private to you).</li>
          <li>Every HomeCare job, added automatically with the professional&apos;s completion notes and invoice.</li>
          <li>Services you record yourself from before you used HomeCare.</li>
        </ul>
      </section>
      <section>
        <h2>Reminders, honestly</h2>
        <p>Suggested service dates come from general guidance configured by HomeCare (for example, AC cleaning before and after summer). They are not manufacturer instructions or inspection results, and a reminder never means an appliance is safe.</p>
      </section>
      <section>
        <h2>You stay in control</h2>
        <p>Add only what you want. You never need to register an appliance to book. Edit or delete your own records any time; job records stay as part of the service history.</p>
      </section>
      <Link href={actor ? `${homePathFor(actor) === "/account" ? "/account/assets" : homePathFor(actor)}` : "/signup"} className={buttonClass("primary", "lg")}>
        {actor ? "Open my passport" : "Start my passport"}
      </Link>
    </ContentPage>
  );
}
