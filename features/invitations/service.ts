import { createHash, randomBytes } from "node:crypto";
import type { Database, Queryable } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { rupeesToPaise } from "@/lib/money";
import { canManagePropertyMembers } from "@/lib/permissions";
import { parseOrThrow } from "@/lib/validation";
import { lockBooking, membershipOf } from "@/features/bookings/service";
import { notify } from "@/features/notifications/service";
import type { Actor } from "@/types/domain";
import { z } from "zod";

/**
 * Invitation links: 32 random bytes, shown once to the inviter. Only the SHA-256 hash is stored.
 * Links are single-use and expire after 7 days. Because no email/SMS provider is configured,
 * the inviter shares the link themselves (WhatsApp, SMS, etc.).
 *
 * Risk note: whoever holds an unexpired link can accept it. Inviters can revoke links, and every
 * acceptance is audited and notified to the inviter.
 */
const TTL_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + TTL_DAYS * 86400000) };
}

const rupeesOptional = z
  .string()
  .trim()
  .regex(/^\d{1,7}$/, "Enter a whole rupee amount")
  .optional()
  .or(z.literal("").transform(() => undefined));

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** A tenant invites their landlord to approve costs on one booking. */
export async function inviteBookingApprover(db: Database, actor: Actor, bookingId: string): Promise<{ token: string; expiresAt: Date }> {
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (b.customerId !== actor.userId) throw notFound("Booking not found.");
      if (b.costApproval !== "LANDLORD") throw new DomainError("VALIDATION", "This booking doesn't need a landlord's approval.");
      if (["COMPLETED", "CANCELLED", "DECLINED"].includes(b.status)) throw new DomainError("VALIDATION", "This booking is closed.");
      const existing = await one<{ n: number }>(tx, `select count(*)::int as n from booking_approvers where booking_id = $1`, [b.id]);
      if ((existing?.n ?? 0) > 0) throw new DomainError("VALIDATION", "Your landlord has already joined this booking.");
      await tx.query(`update invitations set status = 'REVOKED' where booking_id = $1 and kind = 'BOOKING_APPROVER' and status = 'PENDING'`, [b.id]);
      const t = newToken();
      await tx.query(
        `insert into invitations (kind, token_hash, created_by, booking_id, expires_at) values ('BOOKING_APPROVER', $1, $2, $3, $4)`,
        [t.hash, actor.userId, b.id, t.expiresAt],
      );
      await recordAudit(tx, actor, "invitation.created", "booking", b.id, { kind: "BOOKING_APPROVER" });
      return { token: t.token, expiresAt: t.expiresAt };
    }),
  );
}

const propertyInviteSchema = z
  .object({
    propertyId: z.uuid(),
    memberRole: z.enum(["MANAGER", "VIEWER", "TENANT"]),
    unitId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    approvalLimit: rupeesOptional,
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.memberRole !== "TENANT" || v.unitId, { message: "Choose the tenant's unit", path: ["unitId"] });

/** Property owners invite managers, viewers or tenants (tenants are tied to one unit). */
export async function invitePropertyMember(db: Database, actor: Actor, rawInput: unknown): Promise<{ token: string; expiresAt: Date }> {
  const input = parseOrThrow(propertyInviteSchema, rawInput);
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const m = await membershipOf(tx, input.propertyId, actor.userId);
      if (!canManagePropertyMembers(m)) throw m ? forbidden("Only the property owner can invite people.") : notFound("Property not found.");
      if (input.unitId) {
        const u = await one(tx, `select 1 from property_units where id = $1 and property_id = $2`, [input.unitId, input.propertyId]);
        if (!u) throw new DomainError("VALIDATION", "Choose a unit in this property.");
      }
      const limit = input.memberRole === "VIEWER" ? null : input.approvalLimit ? rupeesToPaise(input.approvalLimit) : 0;
      const t = newToken();
      await tx.query(
        `insert into invitations (kind, token_hash, created_by, property_id, unit_id, member_role, approval_limit_paise, note, expires_at)
         values ('PROPERTY_MEMBER', $1, $2, $3, $4, $5, $6, $7, $8)`,
        [t.hash, actor.userId, input.propertyId, input.memberRole === "TENANT" ? input.unitId : (input.unitId ?? null), input.memberRole, limit, input.note || null, t.expiresAt],
      );
      await recordAudit(tx, actor, "invitation.created", "property", input.propertyId, { kind: "PROPERTY_MEMBER", memberRole: input.memberRole, approvalLimitPaise: limit });
      return { token: t.token, expiresAt: t.expiresAt };
    }),
  );
}

const householdInviteSchema = z.object({
  access: z.enum(["VIEW", "MANAGE"]),
  approvalLimit: rupeesOptional,
  note: z.string().trim().max(200).optional(),
});

/** Share your own bookings and home passport with a partner or family member. */
export async function inviteHouseholdMember(db: Database, actor: Actor, rawInput: unknown): Promise<{ token: string; expiresAt: Date }> {
  const input = parseOrThrow(householdInviteSchema, rawInput);
  const limit = input.access === "MANAGE" && input.approvalLimit ? rupeesToPaise(input.approvalLimit) : null;
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const t = newToken();
      await tx.query(
        `insert into invitations (kind, token_hash, created_by, access, approval_limit_paise, note, expires_at)
         values ('HOUSEHOLD_MEMBER', $1, $2, $3, $4, $5, $6)`,
        [t.hash, actor.userId, input.access, limit, input.note || null, t.expiresAt],
      );
      await recordAudit(tx, actor, "invitation.created", "household", actor.userId, { kind: "HOUSEHOLD_MEMBER", access: input.access });
      return { token: t.token, expiresAt: t.expiresAt };
    }),
  );
}

// ---------------------------------------------------------------------------
// Preview, accept, revoke
// ---------------------------------------------------------------------------

export interface InvitePreview {
  kind: "BOOKING_APPROVER" | "PROPERTY_MEMBER" | "HOUSEHOLD_MEMBER";
  inviterName: string;
  description: string;
  valid: boolean;
  reason?: string;
}

async function loadInvite(tx: Queryable, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  return one<{
    id: string;
    kind: InvitePreview["kind"];
    created_by: string;
    booking_id: string | null;
    property_id: string | null;
    unit_id: string | null;
    member_role: string | null;
    access: string | null;
    approval_limit_paise: number | null;
    status: string;
    expires_at: Date;
    inviter: string;
    booking_ref: string | null;
    property_name: string | null;
    unit_label: string | null;
  }>(
    tx,
    `select i.*, p.full_name as inviter, b.reference as booking_ref, pr.name as property_name, u.label as unit_label
     from invitations i join profiles p on p.id = i.created_by
     left join bookings b on b.id = i.booking_id left join properties pr on pr.id = i.property_id
     left join property_units u on u.id = i.unit_id
     where i.token_hash = $1 for update of i`,
    [hashToken(token)],
  );
}

/** What the link is for, without revealing anything beyond what the invitee needs to decide. */
export async function previewInvite(db: Database, token: string): Promise<InvitePreview | null> {
  return db.transaction(async (tx) => {
    const inv = await loadInvite(tx, token);
    if (!inv) return null;
    const limit = inv.approval_limit_paise != null ? `₹${(inv.approval_limit_paise / 100).toLocaleString("en-IN")}` : null;
    const description =
      inv.kind === "BOOKING_APPROVER"
        ? `approve repair costs for booking ${inv.booking_ref} as the landlord`
        : inv.kind === "PROPERTY_MEMBER"
          ? `join ${inv.property_name} as ${inv.member_role === "TENANT" ? `the tenant of ${inv.unit_label}` : inv.member_role?.toLowerCase()}${limit ? ` (approval limit ${limit})` : ""}`
          : `follow their home bookings${inv.access === "MANAGE" ? ` and manage them${limit ? ` (approval limit ${limit})` : ""}` : ""}`;
    const expired = new Date(inv.expires_at).getTime() < Date.now();
    return {
      kind: inv.kind,
      inviterName: inv.inviter,
      description,
      valid: inv.status === "PENDING" && !expired,
      reason: inv.status === "ACCEPTED" ? "This invitation has already been used." : inv.status === "REVOKED" ? "This invitation was cancelled." : expired ? "This invitation has expired." : undefined,
    };
  });
}

export async function acceptInvite(db: Database, actor: Actor, token: string): Promise<{ redirectTo: string }> {
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const inv = await loadInvite(tx, token);
      if (!inv) throw notFound("This invitation link isn't valid.");
      if (inv.status !== "PENDING") throw new DomainError("VALIDATION", "This invitation has already been used or cancelled.");
      if (new Date(inv.expires_at).getTime() < Date.now()) throw new DomainError("VALIDATION", "This invitation has expired. Ask for a new link.");
      if (inv.created_by === actor.userId) throw new DomainError("VALIDATION", "You can't accept your own invitation. Share the link with the other person.");

      let redirectTo = "/account";
      if (inv.kind === "BOOKING_APPROVER") {
        await tx.query(
          `insert into booking_approvers (booking_id, profile_id, relation, approval_limit_paise) values ($1, $2, 'LANDLORD', null) on conflict do nothing`,
          [inv.booking_id, actor.userId],
        );
        redirectTo = `/account/bookings/${inv.booking_id}`;
      } else if (inv.kind === "PROPERTY_MEMBER") {
        const existing = await membershipOf(tx, inv.property_id, actor.userId);
        if (existing?.memberRole === "OWNER") throw new DomainError("VALIDATION", "You already own this property.");
        if (inv.member_role !== "TENANT") {
          // Managers and viewers need the property-manager workspace.
          await tx.query(`insert into role_assignments (profile_id, role, granted_by) values ($1, 'PROPERTY_MANAGER', $2) on conflict do nothing`, [
            actor.userId,
            inv.created_by,
          ]);
        }
        await tx.query(
          `insert into property_memberships (property_id, profile_id, member_role, unit_id, approval_limit_paise) values ($1,$2,$3,$4,$5)
           on conflict (property_id, profile_id) do update set member_role = excluded.member_role, unit_id = excluded.unit_id,
             approval_limit_paise = excluded.approval_limit_paise`,
          [inv.property_id, actor.userId, inv.member_role, inv.unit_id, inv.approval_limit_paise],
        );
        redirectTo = inv.member_role === "TENANT" ? "/account/rented" : `/pm/properties/${inv.property_id}`;
      } else {
        await tx.query(
          `insert into household_members (owner_id, member_id, access, approval_limit_paise) values ($1,$2,$3,$4)
           on conflict (owner_id, member_id) do update set access = excluded.access, approval_limit_paise = excluded.approval_limit_paise`,
          [inv.created_by, actor.userId, inv.access, inv.approval_limit_paise],
        );
        redirectTo = "/account/household";
      }
      await tx.query(`update invitations set status = 'ACCEPTED', accepted_by = $2, accepted_at = now() where id = $1`, [inv.id, actor.userId]);
      await recordAudit(tx, actor, "invitation.accepted", "invitation", inv.id, { kind: inv.kind });
      await notify(tx, [inv.created_by], {
        kind: "invitation_accepted",
        title: "Your invitation was accepted",
        body: `${actor.name} accepted your invitation to ${inv.kind === "BOOKING_APPROVER" ? `approve costs for ${inv.booking_ref}` : inv.kind === "PROPERTY_MEMBER" ? `join ${inv.property_name}` : "your household"}.`,
      });
      return { redirectTo };
    }),
  );
}

export async function revokeInvite(db: Database, actor: Actor, invitationId: string): Promise<void> {
  if (!z.uuid().safeParse(invitationId).success) throw notFound();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const rows = await tx.query(`update invitations set status = 'REVOKED' where id = $1 and created_by = $2 and status = 'PENDING' returning id`, [
        invitationId,
        actor.userId,
      ]);
      if (!rows.length) throw notFound("Invitation not found.");
      await recordAudit(tx, actor, "invitation.revoked", "invitation", invitationId);
    }),
  );
}

export async function listMyInvites(db: Database, actor: Actor) {
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; kind: string; status: string; expiresAt: Date; createdAt: Date; memberRole: string | null; access: string | null; bookingId: string | null; propertyId: string | null; acceptedByName: string | null }>(
      `select i.id, i.kind, i.status, i.expires_at as "expiresAt", i.created_at as "createdAt", i.member_role as "memberRole", i.access,
              i.booking_id as "bookingId", i.property_id as "propertyId", p.full_name as "acceptedByName"
       from invitations i left join profiles p on p.id = i.accepted_by
       where i.created_by = $1 order by i.created_at desc limit 50`,
      [actor.userId],
    ),
  );
}

// ---------------------------------------------------------------------------
// Household and membership management
// ---------------------------------------------------------------------------

export async function getHousehold(db: Database, actor: Actor) {
  return db.asUser(actor.userId, async (tx) => ({
    members: await tx.query<{ memberId: string; name: string; access: string; approvalLimitPaise: number | null; createdAt: Date }>(
      `select h.member_id as "memberId", p.full_name as name, h.access, h.approval_limit_paise as "approvalLimitPaise", h.created_at as "createdAt"
       from household_members h join profiles p on p.id = h.member_id where h.owner_id = $1 order by p.full_name`,
      [actor.userId],
    ),
    memberOf: await tx.query<{ ownerId: string; name: string; access: string; approvalLimitPaise: number | null }>(
      `select h.owner_id as "ownerId", p.full_name as name, h.access, h.approval_limit_paise as "approvalLimitPaise"
       from household_members h join profiles p on p.id = h.owner_id where h.member_id = $1 order by p.full_name`,
      [actor.userId],
    ),
  }));
}

/** Owners remove a member, or members leave someone else's household. */
export async function removeHouseholdLink(db: Database, actor: Actor, ownerId: string, memberId: string): Promise<void> {
  if (actor.userId !== ownerId && actor.userId !== memberId) throw forbidden();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const rows = await tx.query(`delete from household_members where owner_id = $1 and member_id = $2 returning owner_id`, [ownerId, memberId]);
      if (!rows.length) throw notFound("Household link not found.");
      await recordAudit(tx, actor, actor.userId === ownerId ? "household.member_removed" : "household.left", "household", ownerId);
      await notify(tx, [actor.userId === ownerId ? memberId : ownerId], {
        kind: "household_changed",
        title: "Household sharing ended",
        body: actor.userId === ownerId ? "You no longer have access to this household's bookings." : `${actor.name} left your household.`,
      });
    }),
  );
}

/** Owners remove members; any non-owner member can leave. The last owner cannot leave. */
export async function removePropertyMember(db: Database, actor: Actor, propertyId: string, profileId: string): Promise<void> {
  if (!z.uuid().safeParse(propertyId).success || !z.uuid().safeParse(profileId).success) throw notFound();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const mine = await membershipOf(tx, propertyId, actor.userId);
      const target = await membershipOf(tx, propertyId, profileId);
      if (!mine || !target) throw notFound("Member not found.");
      const leaving = actor.userId === profileId;
      if (!leaving && !canManagePropertyMembers(mine)) throw forbidden("Only the property owner can remove members.");
      if (target.memberRole === "OWNER") {
        const owners = await one<{ n: number }>(tx, `select count(*)::int as n from property_memberships where property_id = $1 and member_role = 'OWNER'`, [propertyId]);
        if ((owners?.n ?? 0) <= 1) throw new DomainError("VALIDATION", "A property needs at least one owner. Archive the property instead.");
      }
      await tx.query(`delete from property_memberships where property_id = $1 and profile_id = $2`, [propertyId, profileId]);
      await recordAudit(tx, actor, leaving ? "property.member_left" : "property.member_removed", "property", propertyId, { memberRole: target.memberRole });
      if (!leaving) {
        await notify(tx, [profileId], { kind: "property_access_removed", title: "Property access removed", body: "You no longer have access to a property on HomeCare." });
      }
    }),
  );
}
