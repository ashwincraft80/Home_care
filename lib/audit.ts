import type { Queryable } from "@/lib/database/types";
import type { Actor } from "@/types/domain";

/** Primary role label recorded alongside an action, for audit readability. */
export function actorRoleLabel(actor: Actor | null, relation?: string): string {
  if (!actor) return "SYSTEM";
  if (relation) return relation.toUpperCase();
  if (actor.roles.includes("ADMIN")) return "ADMIN";
  return actor.roles[0] ?? "CUSTOMER";
}

/** Append-only audit record. Must be written in the same transaction as the change it describes. */
export async function recordAudit(
  tx: Queryable,
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
  roleLabel?: string,
): Promise<void> {
  await tx.query(
    `insert into audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor?.userId ?? null, roleLabel ?? actorRoleLabel(actor), action, entityType, entityId, JSON.stringify(metadata)],
  );
}
