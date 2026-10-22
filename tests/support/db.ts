import { createPgliteDatabase } from "@/lib/database/pglite";
import { demoUsers, seedDemoData } from "@/lib/database/seed";
import { loadActor } from "@/lib/auth/actor";
import type { Database } from "@/lib/database/types";
import type { Actor } from "@/types/domain";
import { localDateKey, addDays, upcomingSlots } from "@/lib/time";

export { demoUsers };

/** Fresh in-memory Postgres with the production migrations and demo seed applied. */
export async function createTestDb(): Promise<Database> {
  const db = await createPgliteDatabase();
  await seedDemoData(db);
  return db;
}

export async function actorFor(db: Database, userId: string): Promise<Actor> {
  const a = await loadActor(db, userId);
  if (!a) throw new Error(`No actor ${userId}`);
  return a;
}

export async function categoryId(db: Database, slug: string): Promise<string> {
  const rows = await db.query<{ id: string }>(`select id from service_categories where slug = $1`, [slug]);
  return rows[0].id;
}

/**
 * The n-th upcoming Tuesday–Saturday (n = 1..4), starting tomorrow. Every seeded electrician,
 * plumber and AC professional works daytime windows on these days, so capacity exists.
 */
export function futureSlot(n = 4, windowKey = "16-18") {
  const today = localDateKey(new Date());
  const days: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = addDays(today, i);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd >= 2 && wd <= 6) days.push(d);
  }
  if (n > days.length) throw new Error("Not enough working days in the horizon");
  return { date: days[n - 1], windowKey };
}

export function anyUpcomingSlot() {
  return upcomingSlots()[10];
}

let keyCounter = 0;
export function idemKey() {
  keyCounter += 1;
  return `test-key-${Date.now()}-${keyCounter}`;
}

export function bookingPayload(categoryIdValue: string, overrides: Record<string, unknown> = {}) {
  const slot = futureSlot();
  return {
    categoryId: categoryIdValue,
    problemDescription: "The kitchen light flickers and then switches off.",
    date: slot.date,
    windowKey: slot.windowKey,
    address: { line1: "House 12, Demo Street", pincode: "560038" }, // Indiranagar
    saveAddress: false,
    paymentMethod: "PAY_AFTER_SERVICE",
    idempotencyKey: idemKey(),
    acceptPolicy: true,
    ...overrides,
  };
}
