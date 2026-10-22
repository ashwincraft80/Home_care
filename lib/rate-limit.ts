import { DomainError } from "@/lib/errors";

/**
 * Fixed-window rate limiter kept in process memory.
 *
 * Good enough for a single server and local demo. For multiple instances or serverless
 * deployments, replace `store` with a shared backend (e.g. Redis/Upstash) behind the same
 * function signature — see docs/launch-checklist.md.
 */
const store = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    if (store.size > 10000) {
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  if (!checkRateLimit(key, limit, windowMs)) {
    throw new DomainError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.");
  }
}

export const limits = {
  bookingCreate: { limit: 10, windowMs: 10 * 60 * 1000 },
  auth: { limit: 10, windowMs: 10 * 60 * 1000 },
  complaint: { limit: 10, windowMs: 60 * 60 * 1000 },
  upload: { limit: 30, windowMs: 10 * 60 * 1000 },
  analytics: { limit: 120, windowMs: 60 * 1000 },
  mutation: { limit: 120, windowMs: 60 * 1000 },
};
