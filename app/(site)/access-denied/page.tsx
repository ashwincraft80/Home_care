import type { Metadata } from "next";
import Link from "next/link";
import { ErrorStateIllustration } from "@/components/motion/illustrations";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default function AccessDenied() {
  return (
    <div className="container-page max-w-lg py-20 text-center">
      <ErrorStateIllustration className="mx-auto" />
      <h1 className="mt-4 font-display text-3xl font-semibold">This area isn&apos;t part of your account</h1>
      <p className="mt-2 text-ink-muted">Access is based on the roles on your account. If you think you should have access, contact support.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/dashboard" className={buttonClass("primary", "md")}>
          Go to my account
        </Link>
        <Link href="/contact" className={buttonClass("secondary", "md")}>
          Contact support
        </Link>
      </div>
    </div>
  );
}
