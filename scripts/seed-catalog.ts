/**
 * Seeds service categories and initial city/area coverage into DATABASE_URL. Idempotent and contains
 * no personal data, so it is safe for staging and production. Demo personas are NEVER seeded here.
 */
import postgres from "postgres";
import { seedCatalog, seedCoverage } from "../lib/database/seed";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => {
    const q = { query: async <T,>(text: string, params?: unknown[]) => Array.from(await tx.unsafe(text, (params ?? []) as never[])) as T[] };
    await seedCatalog(q);
    await seedCoverage(q);
  });
  console.log("Catalogue and coverage seeded. Review prices, pincodes and area statuses in the admin console before launch.");
} finally {
  await sql.end();
}
