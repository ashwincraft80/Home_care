import type { ReactNode } from "react";
import { Badge } from "@/components/ui/surface";

export function ContentPage({ eyebrow, title, intro, children, legalDraft }: { eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode; legalDraft?: boolean }) {
  return (
    <article className="container-page max-w-3xl py-12 sm:py-16">
      {eyebrow && <p className="mb-2 text-sm font-bold tracking-wide text-brand">{eyebrow}</p>}
      <h1 className="font-display text-[38px] leading-tight font-semibold text-ink sm:text-[46px]">{title}</h1>
      {legalDraft && (
        <div className="mt-4">
          <Badge tone="warning">Placeholder — requires legal review before launch</Badge>
        </div>
      )}
      {intro && <p className="mt-4 text-[18px] leading-relaxed text-ink-muted">{intro}</p>}
      <div className="prose-hc mt-10 space-y-8 text-[16px] leading-relaxed text-ink-muted [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-ink [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
