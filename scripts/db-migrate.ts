/**
 * Applies supabase/migrations/*.sql to the database at DATABASE_URL (Supabase Postgres), tracking
 * applied files in app.schema_migrations. Alternatively use the Supabase CLI (`supabase db push`) —
 * use ONE of the two approaches for a given database, not both.
 */
import postgres from "postgres";
import { applyMigrations } from "../lib/database/migrations";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (use the direct/session connection string, not the anon key).");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  const ran = await applyMigrations(
    {
      exec: async (text) => {
        await sql.unsafe(text);
      },
      appliedNames: async () => new Set((await sql.unsafe<{ name: string }[]>("select name from app.schema_migrations")).map((r) => r.name)),
      record: async (name) => {
        await sql.unsafe("insert into app.schema_migrations (name) values ($1)", [name]);
      },
    },
    (m) => console.log(m),
  );
  console.log(ran.length ? `Applied ${ran.length} migration(s).` : "Database is up to date.");
} finally {
  await sql.end();
}
