import type { Database, Queryable } from "@/lib/database/types";
import type { Actor } from "@/types/domain";

export interface NotificationInput {
  kind: string;
  title: string;
  body: string;
  link?: string;
}

/** Writes in-app notifications in the caller's transaction. External channels are dispatched separately. */
export async function notify(tx: Queryable, recipientIds: (string | null | undefined)[], n: NotificationInput) {
  const unique = [...new Set(recipientIds.filter((x): x is string => Boolean(x)))];
  for (const id of unique) {
    await tx.query(
      `insert into notifications (recipient_id, kind, title, body, link) values ($1, $2, $3, $4, $5)`,
      [id, n.kind, n.title, n.body, n.link ?? null],
    );
  }
}

export async function adminIds(tx: Queryable): Promise<string[]> {
  const rows = await tx.query<{ profile_id: string }>(`select profile_id from role_assignments where role = 'ADMIN'`);
  return rows.map((r) => r.profile_id);
}

/** Property members who can act on requests (owners and managers). */
export async function propertyManagerIds(tx: Queryable, propertyId: string | null): Promise<string[]> {
  if (!propertyId) return [];
  const rows = await tx.query<{ profile_id: string }>(
    `select profile_id from property_memberships where property_id = $1 and member_role in ('OWNER','MANAGER')`,
    [propertyId],
  );
  return rows.map((r) => r.profile_id);
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export async function listNotifications(db: Database, actor: Actor, limit = 20): Promise<NotificationRow[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<NotificationRow>(
      `select id, kind, title, body, link, read_at as "readAt", created_at as "createdAt"
       from notifications where recipient_id = $1 order by created_at desc limit $2`,
      [actor.userId, limit],
    ),
  );
}

export async function unreadCount(db: Database, actor: Actor): Promise<number> {
  const rows = await db.asUser(actor.userId, (tx) =>
    tx.query<{ n: number }>(`select count(*)::int as n from notifications where recipient_id = $1 and read_at is null`, [
      actor.userId,
    ]),
  );
  return rows[0]?.n ?? 0;
}

export async function markAllRead(db: Database, actor: Actor): Promise<void> {
  await db.transaction((tx) =>
    tx.query(`update notifications set read_at = now() where recipient_id = $1 and read_at is null`, [actor.userId]),
  );
}
