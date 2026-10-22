import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, Building, HardHat, KeyRound, ShieldCheck, User } from "lucide-react";
import { isDemoMode } from "@/lib/config/env";
import { demoPersonas } from "@/lib/database/seed";
import { demoSignInAction } from "@/lib/auth/actions";
import { getActor } from "@/lib/auth/session";
import { Alert, Card } from "@/components/ui/surface";
import { SupabaseSignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const roleIcon = { CUSTOMER: User, TECHNICIAN: HardHat, PROPERTY_MANAGER: Building, ADMIN: ShieldCheck } as const;
const roleGroup = { CUSTOMER: "Customers & households", TECHNICIAN: "Professionals", PROPERTY_MANAGER: "Landlords & property managers", ADMIN: "Operations" } as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const actor = await getActor();
  const demo = isDemoMode();

  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <h1 className="font-display text-[34px] font-semibold text-ink">Sign in</h1>
      {actor && (
        <Alert tone="info" className="mt-4">
          You&apos;re signed in as {actor.name}. Choosing another persona switches account.
        </Alert>
      )}
      {error && (
        <Alert tone="danger" className="mt-4">
          That sign-in link didn&apos;t work. Please try again.
        </Alert>
      )}

      {demo ? (
        <>
          <p className="mt-2 text-[17px] text-ink-muted">
            This is a demo. Pick a persona to explore HomeCare from their side — no password needed. All names, numbers and addresses are fictional.
          </p>
          {(Object.keys(roleGroup) as (keyof typeof roleGroup)[]).map((role) => {
            const people = demoPersonas.filter((p) => p.role === role || (role === "CUSTOMER" && p.role === "CUSTOMER"));
            if (!people.length) return null;
            const Icon = roleIcon[role];
            return (
              <section key={role} className="mt-8">
                <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-muted uppercase">
                  <Icon className="size-4" aria-hidden /> {roleGroup[role]}
                </h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {people.map((p) => (
                    <form key={p.id} action={demoSignInAction}>
                      <input type="hidden" name="userId" value={p.id} />
                      {next && <input type="hidden" name="next" value={next} />}
                      <button type="submit" className="flex w-full items-start gap-3 rounded-xl border border-white/70 bg-white/60 p-4 text-left transition-colors hover:border-brand">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sage-soft font-bold text-brand-ink">{p.name.charAt(0)}</span>
                        <span>
                          <span className="block font-bold text-ink">{p.name}</span>
                          <span className="block text-sm text-ink-muted">{p.description}</span>
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            );
          })}
          <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <KeyRound className="size-5 text-brand" aria-hidden />
              <p className="text-[15px] text-ink">Want to see the first-time experience?</p>
            </div>
            <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand hover:underline">
              Create a demo account
            </Link>
          </Card>
        </>
      ) : (
        <>
          <p className="mt-2 text-[17px] text-ink-muted">Sign in with your email and password.</p>
          <Card className="mt-6 p-6">
            <SupabaseSignInForm next={next} />
          </Card>
          <p className="mt-4 text-sm text-ink-muted">
            New to HomeCare?{" "}
            <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand hover:underline">
              Create an account
            </Link>
          </p>
        </>
      )}
      <p className="mt-8 flex items-center gap-2 text-sm text-ink-subtle">
        <BriefcaseBusiness className="size-4" aria-hidden /> Roles come from your account on our server — never from what the browser sends.
      </p>
    </div>
  );
}
