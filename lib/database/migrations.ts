import fs from "node:fs";
import path from "node:path";

export interface MigrationFile {
  name: string;
  sql: string;
}

const root = () => path.join(process.cwd(), "supabase");

export function readMigrations(): MigrationFile[] {
  const dir = path.join(root(), "migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));
}

export function readLocalShim(): string {
  return fs.readFileSync(path.join(root(), "local", "shim.sql"), "utf8");
}

export interface MigrationRunner {
  exec(sql: string): Promise<void>;
  appliedNames(): Promise<Set<string>>;
  record(name: string): Promise<void>;
}

const TRACKING_SQL = `
  create schema if not exists app;
  create table if not exists app.schema_migrations (name text primary key, applied_at timestamptz not null default now());
`;

export async function applyMigrations(runner: MigrationRunner, log: (m: string) => void = () => {}): Promise<string[]> {
  await runner.exec(TRACKING_SQL);
  const applied = await runner.appliedNames();
  const ran: string[] = [];
  for (const m of readMigrations()) {
    if (applied.has(m.name)) continue;
    log(`Applying ${m.name}`);
    await runner.exec(m.sql);
    await runner.record(m.name);
    ran.push(m.name);
  }
  return ran;
}
