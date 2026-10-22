import { PGlite, type Transaction } from "@electric-sql/pglite";
import { applyMigrations, readLocalShim } from "./migrations";
import { claimsFor, type Database, type Queryable } from "./types";

function wrap(q: PGlite | Transaction): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const res = await q.query<T>(text, params as never[]);
      return res.rows;
    },
  };
}

/**
 * Embedded Postgres for demo mode and tests. Pass a directory to persist, or nothing for in-memory.
 * The Supabase shim + the same migrations used in production are applied on open.
 */
export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  await pg.exec(readLocalShim());
  await applyMigrations({
    exec: async (sql) => {
      await pg.exec(sql);
    },
    appliedNames: async () =>
      new Set((await pg.query<{ name: string }>("select name from app.schema_migrations")).rows.map((r) => r.name)),
    record: async (name) => {
      await pg.query("insert into app.schema_migrations (name) values ($1)", [name]);
    },
  });

  return {
    kind: "pglite",
    query: (text, params) => wrap(pg).query(text, params),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    asUser: (userId, fn) =>
      pg.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [claimsFor(userId)]);
        await tx.exec(userId ? "set local role authenticated" : "set local role anon");
        return fn(wrap(tx));
      }),
    close: () => pg.close(),
  };
}
