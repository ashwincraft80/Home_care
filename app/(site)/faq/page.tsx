import type { Metadata } from "next";
import { ContentPage } from "@/components/domain/content-page";
import { faqs } from "@/lib/content/faq";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <ContentPage eyebrow="Help" title="Frequently asked questions">
      <div className="divide-y divide-line rounded-[var(--radius-card)] glass glass-sheen">
        {faqs.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-ink">
              {f.q}
              <span aria-hidden className="text-xl text-ink-subtle transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2">{f.a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
