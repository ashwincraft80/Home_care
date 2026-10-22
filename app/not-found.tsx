import Link from "next/link";
import { ErrorStateIllustration } from "@/components/motion/illustrations";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <ErrorStateIllustration className="mx-auto" />
        <h1 className="mt-4 font-display text-3xl font-semibold text-ink">We couldn&apos;t find that</h1>
        <p className="mt-2 text-ink-muted">The page doesn&apos;t exist, or it isn&apos;t shared with your account.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className={buttonClass("primary", "md")}>
            Go home
          </Link>
          <Link href="/dashboard" className={buttonClass("secondary", "md")}>
            My account
          </Link>
        </div>
      </div>
    </main>
  );
}
