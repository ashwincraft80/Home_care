"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/database";
import { getAppUrl, isDemoMode } from "@/lib/config/env";
import { assertRateLimit, limits } from "@/lib/rate-limit";
import { DomainError, toActionError, type ActionResult } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { clientIp, endSession, startDemoSession } from "./session";
import { homePathFor, loadActor } from "./actor";

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
function safeNext(next: FormDataEntryValue | null): string | null {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null;
}

// ---------------------------------------------------------------------------
// Demo mode — no passwords. Only available when HOMECARE_MODE=demo.
// ---------------------------------------------------------------------------

export async function demoSignInAction(formData: FormData): Promise<void> {
  if (!isDemoMode()) throw new Error("Demo sign-in is disabled.");
  const userId = String(formData.get("userId") ?? "");
  if (!z.uuid().safeParse(userId).success) throw new Error("Unknown persona");
  const db = await getDb();
  const actor = await loadActor(db, userId);
  if (!actor) throw new Error("Unknown persona");
  await startDemoSession(userId);
  redirect(safeNext(formData.get("next")) ?? homePathFor(actor));
}

const demoSignupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  intent: z.enum(["customer", "technician", "property_manager"]),
  terms: z.literal("on", { error: "Please accept the terms to continue" }),
});

export async function demoSignUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    if (!isDemoMode()) throw new DomainError("FORBIDDEN", "Demo sign-up is disabled.");
    assertRateLimit(`auth:${await clientIp()}`, limits.auth.limit, limits.auth.windowMs);
    const input = parseOrThrow(demoSignupSchema, { fullName: formData.get("fullName"), intent: formData.get("intent"), terms: formData.get("terms") });
    const db = await getDb();
    const rows = await db.transaction((tx) =>
      tx.query<{ id: string }>(`insert into auth.users (raw_user_meta_data) values ($1::jsonb) returning id`, [
        JSON.stringify({ full_name: `${input.fullName} (Demo)`, signup_intent: input.intent, terms_accepted: "true" }),
      ]),
    );
    await startDemoSession(rows[0].id);
  } catch (err) {
    return toActionError(err);
  }
  redirect(safeNext(formData.get("next")) ?? "/dashboard");
}

// ---------------------------------------------------------------------------
// Supabase mode — email + password via Supabase Auth.
// ---------------------------------------------------------------------------

const signInSchema = z.object({ email: z.email({ error: "Enter a valid email" }), password: z.string().min(8, "At least 8 characters") });

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    if (isDemoMode()) throw new DomainError("FORBIDDEN", "Use a demo persona in demo mode.");
    assertRateLimit(`auth:${await clientIp()}`, limits.auth.limit, limits.auth.windowMs);
    const input = parseOrThrow(signInSchema, { email: formData.get("email"), password: formData.get("password") });
    const { createSupabaseServerClient } = await import("./supabase");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) throw new DomainError("UNAUTHENTICATED", "Email or password is incorrect, or your email isn't confirmed yet.");
  } catch (err) {
    return toActionError(err);
  }
  redirect(safeNext(formData.get("next")) ?? "/dashboard");
}

const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  intent: z.enum(["customer", "technician", "property_manager"]),
  terms: z.literal("on", { error: "Please accept the terms to continue" }),
});

export async function signUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    if (isDemoMode()) throw new DomainError("FORBIDDEN", "Use demo sign-up in demo mode.");
    assertRateLimit(`auth:${await clientIp()}`, limits.auth.limit, limits.auth.windowMs);
    const input = parseOrThrow(signUpSchema, Object.fromEntries(formData));
    const { createSupabaseServerClient } = await import("./supabase");
    const supabase = await createSupabaseServerClient();
    const next = safeNext(formData.get("next")) ?? "/dashboard";
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Only these three self-service intents are accepted by the database trigger. ADMIN is never self-assigned.
        data: { full_name: input.fullName, signup_intent: input.intent, terms_accepted: "true" },
        emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) throw new DomainError("VALIDATION", "We couldn't create that account. Try a different email or sign in.");
    return { ok: true, data: undefined, message: "Check your email to confirm your account, then sign in." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
