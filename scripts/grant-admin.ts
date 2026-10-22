/**
 * Grants the ADMIN role to an existing account by email. Run from a trusted machine only.
 *   DATABASE_URL=... npm run db:grant-admin -- ops@yourcompany.in
 */
import postgres from "postgres";

const email = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url || !email) {
  console.error("Usage: DATABASE_URL=... npm run db:grant-admin -- <email>");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  const rows = await sql`select profile_id from profile_contacts where lower(email) = lower(${email})`;
  if (!rows.length) throw new Error(`No account with email ${email}. Sign up first.`);
  await sql.begin(async (tx) => {
    await tx`insert into role_assignments (profile_id, role) values (${rows[0].profile_id}, 'ADMIN') on conflict do nothing`;
    await tx`insert into audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
             values (null, 'SYSTEM', 'role.granted', 'profile', ${rows[0].profile_id}, '{"role":"ADMIN","via":"grant-admin script"}'::jsonb)`;
  });
  console.log(`Granted ADMIN to ${email}.`);
} finally {
  await sql.end();
}
