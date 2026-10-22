import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { adminIds, notify } from "@/features/notifications/service";
import { parseOrThrow, profileInputSchema } from "@/lib/validation";
import type { Actor } from "@/types/domain";
import { z } from "zod";

export async function getProfile(db: Database, actor: Actor) {
  return db.asUser(actor.userId, async (tx) => ({
    profile: (await one<{ fullName: string; preferredLanguage: "en" | "hi"; deletionRequestedAt: Date | null; createdAt: Date }>(
      tx,
      `select full_name as "fullName", preferred_language as "preferredLanguage", deletion_requested_at as "deletionRequestedAt", created_at as "createdAt" from profiles where id = $1`,
      [actor.userId],
    ))!,
    contact: await one<{ phone: string | null; email: string | null }>(tx, `select phone, email from profile_contacts where profile_id = $1`, [actor.userId]),
    addresses: await tx.query<{ id: string; label: string; line1: string; landmark: string | null; locality: string; city: string; pincode: string }>(
      `select id, label, line1, landmark, locality, city, pincode from addresses where profile_id = $1 order by created_at desc`,
      [actor.userId],
    ),
  }));
}

export async function updateProfile(db: Database, actor: Actor, raw: unknown): Promise<void> {
  const input = parseOrThrow(profileInputSchema, raw);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(`update profiles set full_name = $2, preferred_language = $3 where id = $1`, [actor.userId, input.fullName, input.preferredLanguage]);
      await tx.query(
        `insert into profile_contacts (profile_id, phone) values ($1, $2) on conflict (profile_id) do update set phone = excluded.phone, updated_at = now()`,
        [actor.userId, input.phone ?? null],
      );
      await recordAudit(tx, actor, "profile.updated", "profile", actor.userId);
    }),
  );
}

export async function deleteAddress(db: Database, actor: Actor, addressId: string): Promise<void> {
  if (!z.uuid().safeParse(addressId).success) throw notFound();
  await db.transaction(async (tx) => {
    const rows = await tx.query(`delete from addresses where id = $1 and profile_id = $2 returning id`, [addressId, actor.userId]);
    if (!rows.length) throw notFound("Address not found.");
  });
}

/**
 * Records a data-deletion request for operations to process. Booking, invoice and audit records
 * may need to be retained for legal/tax reasons, so deletion is reviewed rather than automatic.
 */
export async function requestAccountDeletion(db: Database, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`update profiles set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = $1`, [actor.userId]);
    await recordAudit(tx, actor, "profile.deletion_requested", "profile", actor.userId);
    await notify(tx, await adminIds(tx), { kind: "deletion_request", title: "Account deletion requested", body: "Review and process within the retention policy.", link: `/admin/users` });
  });
}
