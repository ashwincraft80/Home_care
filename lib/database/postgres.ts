import postgres from "postgres";
import { claimsFor, type Database, type Queryable } from "./types";

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const rows = await sql.unsafe(text, (params ?? []) as postgres.ParameterOrJSON<never>[]);
      return Array.from(rows) as T[];
    },
  };
}

/**
 * Connection to Supabase Postgres using DATABASE_URL (server-only).
 * `prepare: false` keeps it compatible with Supabase's transaction-mode pooler.
 */
export function createPostgresDatabase(url: string): Database {
  const sql = postgres(url, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 10 });
  return {
    kind: "postgres",
    query: (text, params) => wrap(sql).query(text, params),
    transaction: async (fn) => (await sql.begin((tx) => fn(wrap(tx)))) as never,
    asUser: async (userId, fn) =>
      (await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [claimsFor(userId)]);
        await tx.unsafe(userId ? "set local role authenticated" : "set local role anon");
        return fn(wrap(tx));
      })) as never,
    close: () => sql.end({ timeout: 5 }),
  };
}
