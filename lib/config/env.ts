import "server-only";
import path from "node:path";

/**
 * Mode selection.
 *
 * HOMECARE_MODE=demo     -> embedded Postgres (PGlite) with seeded demo data and demo sign-in.
 * HOMECARE_MODE=supabase -> Supabase Auth + Postgres + Storage. All credentials required.
 *
 * There is deliberately no automatic fallback: if supabase mode is selected and
 * configuration is missing, the app fails loudly instead of quietly running on demo data.
 */
export type AppMode = "demo" | "supabase";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function getMode(): AppMode {
  const raw = process.env.HOMECARE_MODE;
  if (raw === "demo" || raw === "supabase") return raw;
  if (!raw && process.env.NODE_ENV !== "production") return "demo";
  throw new ConfigurationError(
    `HOMECARE_MODE must be set to "demo" or "supabase" (received ${raw ? `"${raw}"` : "nothing"}). ` +
      "Production builds never pick a mode implicitly.",
  );
}

export function isDemoMode(): boolean {
  return getMode() === "demo";
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigurationError(`Missing required environment variable ${name} for supabase mode.`);
  return v;
}

export function getSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    databaseUrl: required("DATABASE_URL"),
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "homecare-private",
  };
}

export function getDemoConfig() {
  const dataDir = path.resolve(process.cwd(), process.env.HOMECARE_DEMO_DATA_DIR || ".data/demo");
  return {
    dataDir,
    dbDir: path.join(dataDir, "pglite"),
    uploadsDir: path.join(dataDir, "uploads"),
    secretFile: path.join(dataDir, "session-secret"),
  };
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
