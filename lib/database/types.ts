export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Database access boundary.
 *
 * - `asUser` runs work as the given user with Row Level Security enforced. Use it for reads.
 * - `transaction` runs work with table-owner privileges. Use it ONLY after the service layer has
 *   authorised the action; it is how all writes happen.
 *
 * Inside a callback, only use the provided `tx` — never call back into the Database, which can
 * deadlock the single-connection embedded database.
 */
export interface Database {
  readonly kind: "pglite" | "postgres";
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  asUser<T>(userId: string | null, fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function claimsFor(userId: string | null): string {
  return JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" });
}

export async function one<T>(tx: Queryable, text: string, params?: unknown[]): Promise<T | null> {
  const rows = await tx.query<T>(text, params);
  return rows[0] ?? null;
}
