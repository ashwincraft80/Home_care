"use server";

import { cookies } from "next/headers";
import { withActor, str } from "@/lib/actions";
import { getAppUrl } from "@/lib/config/env";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import type { ActionResult } from "@/lib/errors";
import { deleteAddress, requestAccountDeletion, updateProfile } from "./service";
import { inviteHouseholdMember, invitePropertyMember, removeHouseholdLink, removePropertyMember, revokeInvite } from "@/features/invitations/service";

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData) {
  const res = await withActor(
    ({ actor, db }) => updateProfile(db, actor, { fullName: str(fd, "fullName"), phone: str(fd, "phone"), preferredLanguage: str(fd, "preferredLanguage") }),
    { success: "Profile saved." },
  );
  if (res.ok) (await cookies()).set(LOCALE_COOKIE, str(fd, "preferredLanguage") === "hi" ? "hi" : "en", { path: "/", sameSite: "lax", maxAge: 31536000 });
  return res;
}

export async function deleteAddressAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => deleteAddress(db, actor, str(fd, "addressId")), { success: "Address removed." });
}

export async function requestDeletionAction() {
  return withActor(({ actor, db }) => requestAccountDeletion(db, actor), { success: "Request received. Operations will contact you to confirm." });
}

export async function inviteHouseholdAction(_prev: ActionResult<{ link: string; expiresAt: string }> | null, fd: FormData) {
  return withActor(async ({ actor, db }) => {
    const inv = await inviteHouseholdMember(db, actor, { access: str(fd, "access"), approvalLimit: str(fd, "approvalLimit"), note: str(fd, "note") || undefined });
    return { link: `${getAppUrl()}/invite/${inv.token}`, expiresAt: inv.expiresAt.toISOString() };
  });
}

export async function invitePropertyMemberAction(_prev: ActionResult<{ link: string; expiresAt: string }> | null, fd: FormData) {
  return withActor(async ({ actor, db }) => {
    const inv = await invitePropertyMember(db, actor, {
      propertyId: str(fd, "propertyId"),
      memberRole: str(fd, "memberRole"),
      unitId: str(fd, "unitId"),
      approvalLimit: str(fd, "approvalLimit"),
      note: str(fd, "note") || undefined,
    });
    return { link: `${getAppUrl()}/invite/${inv.token}`, expiresAt: inv.expiresAt.toISOString() };
  });
}

export async function removeHouseholdAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => removeHouseholdLink(db, actor, str(fd, "ownerId"), str(fd, "memberId")), { success: "Done." });
}

export async function removePropertyMemberAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => removePropertyMember(db, actor, str(fd, "propertyId"), str(fd, "profileId")), { success: "Done." });
}

export async function revokeInviteAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => revokeInvite(db, actor, str(fd, "invitationId")), { success: "Invitation cancelled." });
}
