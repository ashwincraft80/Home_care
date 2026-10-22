import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDemoConfig, getMode, isDemoMode } from "@/lib/config/env";
import { getDb } from "@/lib/database";
import { loadActor } from "./actor";
import type { Actor, Role } from "@/types/domain";

export const DEMO_SESSION_COOKIE = "hc_demo_session";

let cachedSecret: string | null = null;

/** Demo session signing key: env var if provided, otherwise a random key kept in the demo data dir. */
function demoSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.DEMO_SESSION_SECRET && process.env.DEMO_SESSION_SECRET.length >= 32) {
    cachedSecret = process.env.DEMO_SESSION_SECRET;
    return cachedSecret;
  }
  const { secretFile } = getDemoConfig();
  try {
    cachedSecret = fs.readFileSync(secretFile, "utf8").trim();
  } catch {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    cachedSecret = randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function signDemo(userId: string): string {
  const sig = createHmac("sha256", demoSecret()).update(`demo:${userId}`).digest("base64url");
  return `${userId}.${sig}`;
}

function verifyDemo(token: string | undefined): string | null {
  if (!token) return null;
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = signDemo(userId).split(".")[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

/** Authenticated user id from the session. Supabase sessions are verified with the Auth server. */
export async function getSessionUserId(): Promise<string | null> {
  if (isDemoMode()) {
    const store = await cookies();
    return verifyDemo(store.get(DEMO_SESSION_COOKIE)?.value);
  }
  const { createSupabaseServerClient } = await import("./supabase");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/** Current actor for this request (memoised per request). Roles are loaded from the database. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return loadActor(await getDb(), userId);
});

/** Use in pages and layouts. Redirects to sign-in or the access-denied page. */
export async function requireActor(role?: Role): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    const h = await headers();
    const next = h.get("x-hc-pathname") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (role && !actor.roles.includes(role)) redirect("/access-denied");
  return actor;
}

/** Use in Server Actions: never redirects, so callers can return a typed error. */
export async function actorOrNull(): Promise<Actor | null> {
  return getActor();
}

export async function startDemoSession(userId: string): Promise<void> {
  if (getMode() !== "demo") throw new Error("Demo sessions are only available in demo mode.");
  const store = await cookies();
  store.set(DEMO_SESSION_COOKIE, signDemo(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function endSession(): Promise<void> {
  if (isDemoMode()) {
    (await cookies()).delete(DEMO_SESSION_COOKIE);
    return;
  }
  const { createSupabaseServerClient } = await import("./supabase");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function anonymousId(): Promise<string | null> {
  return (await cookies()).get("hc_aid")?.value ?? null;
}
