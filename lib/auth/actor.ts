import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import type { Actor, Role, TechnicianVerification } from "@/types/domain";

/**
 * Resolves roles from the database for an authenticated user id. Roles are never read from
 * cookies, JWT custom claims or request bodies.
 */
export async function loadActor(db: Database, userId: string): Promise<Actor | null> {
  return db.asUser(userId, async (tx) => {
    const p = await one<{ full_name: string }>(tx, `select full_name from profiles where id = $1`, [userId]);
    if (!p) return null;
    const roles = await tx.query<{ role: Role }>(`select role from role_assignments where profile_id = $1 order by role`, [userId]);
    const tech = await one<{ verification_status: TechnicianVerification }>(
      tx,
      `select verification_status from technician_profiles where profile_id = $1`,
      [userId],
    );
    return {
      userId,
      name: p.full_name,
      roles: roles.map((r) => r.role),
      technicianStatus: tech?.verification_status ?? null,
    };
  });
}

/** Which workspace to open after sign-in. */
export function homePathFor(actor: Actor): string {
  if (actor.roles.includes("ADMIN")) return "/admin";
  if (actor.roles.includes("TECHNICIAN")) return "/tech";
  if (actor.roles.includes("PROPERTY_MANAGER")) return "/pm";
  return "/account";
}
