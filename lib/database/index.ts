import "server-only";
import fs from "node:fs";
import { getDemoConfig, getMode, getSupabaseConfig } from "@/lib/config/env";
import type { Database } from "./types";

const globalForDb = globalThis as unknown as { __homecareDb?: Promise<Database> };

async function open(): Promise<Database> {
  const mode = getMode();
  if (mode === "supabase") {
    const { createPostgresDatabase } = await import("./postgres");
    return createPostgresDatabase(getSupabaseConfig().databaseUrl);
  }
  const cfg = getDemoConfig();
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const { createPgliteDatabase } = await import("./pglite");
  const db = await createPgliteDatabase(cfg.dbDir);
  const { isSeeded, seedDemoData } = await import("./seed");
  if (!(await isSeeded(db))) {
    console.info("[homecare] Seeding demo database at", cfg.dbDir);
    await seedDemoData(db);
  }
  return db;
}

/**
 * Process-wide database handle. In demo mode this is an embedded Postgres stored under
 * .data/demo (never shared with production). In supabase mode it connects with DATABASE_URL.
 */
export function getDb(): Promise<Database> {
  if (!globalForDb.__homecareDb) {
    globalForDb.__homecareDb = open().catch((err) => {
      globalForDb.__homecareDb = undefined;
      throw err;
    });
  }
  return globalForDb.__homecareDb;
}
