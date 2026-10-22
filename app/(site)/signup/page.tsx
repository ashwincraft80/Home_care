import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode } from "@/lib/config/env";
import { Card } from "@/components/ui/surface";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const { next, as } = await searchParams;
  const demo = isDemoMode();
  return (
    <div className="container-page max-w-xl py-12 sm:py-16">
      <h1 className="font-display text-[34px] font-semibold text-ink">Create your account</h1>
      <p className="mt-2 text-[17px] text-ink-muted">
        {demo
          ? "Demo account: just a name. It lives only in this demo database."
          : "We only ask for what we need to book and manage your services."}
      </p>
      <Card className="mt-6 p-6">
        <SignUpForm demo={demo} next={next} defaultIntent={as === "technician" || as === "property_manager" ? as : "customer"} />
      </Card>
      <p className="mt-4 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
