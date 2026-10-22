import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquareWarning, Phone } from "lucide-react";
import { ContentPage } from "@/components/domain/content-page";
import { Card } from "@/components/ui/surface";
import { site } from "@/lib/config/site";

export const metadata: Metadata = { title: "Contact & support" };

export default function ContactPage() {
  return (
    <ContentPage eyebrow="Contact" title="Talk to a person" intro={`Support hours: ${site.contact.supportHours}.`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <Phone className="size-5 text-brand" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Call</p>
          <p className="text-sm">{site.contact.supportPhone}</p>
        </Card>
        <Card className="p-5">
          <Mail className="size-5 text-brand" aria-hidden />
          <p className="mt-3 font-semibold text-ink">Email</p>
          <a href={`mailto:${site.contact.supportEmail}`} className="text-sm text-brand underline">
            {site.contact.supportEmail}
          </a>
        </Card>
        <Card className="p-5">
          <MessageSquareWarning className="size-5 text-brand" aria-hidden />
          <p className="mt-3 font-semibold text-ink">About a booking</p>
          <Link href="/support" className="text-sm text-brand underline">
            Raise an issue you can track
          </Link>
        </Card>
      </div>
      <p className="text-sm">Contact details above are placeholders in this build and must be replaced before launch. WhatsApp support isn&apos;t connected yet.</p>
    </ContentPage>
  );
}
