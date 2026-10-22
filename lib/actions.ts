import "server-only";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/database";
import type { Database } from "@/lib/database/types";
import { actorOrNull } from "@/lib/auth/session";
import { assertRateLimit, limits } from "@/lib/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import type { Actor } from "@/types/domain";

/**
 * Wraps a Server Action: re-reads the session (never trusts the client), rate-limits per user,
 * runs the service, refreshes rendered data and converts errors into safe messages.
 */
export async function withActor<T>(
  fn: (ctx: { actor: Actor; db: Database }) => Promise<T>,
  opts: { rate?: { key: string; limit: number; windowMs: number }; success?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const actor = await actorOrNull();
    if (!actor) return { ok: false, error: "Your session has ended. Please sign in again.", code: "UNAUTHENTICATED" };
    const rate = opts.rate ?? { key: "mutation", ...limits.mutation };
    assertRateLimit(`${rate.key}:${actor.userId}`, rate.limit, rate.windowMs);
    const db = await getDb();
    const data = await fn({ actor, db });
    revalidatePath("/", "layout");
    return { ok: true, data, message: opts.success };
  } catch (err) {
    return toActionError(err);
  }
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
