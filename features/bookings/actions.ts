"use server";

import { getDb } from "@/lib/database";
import { withActor, str } from "@/lib/actions";
import { anonymousId, actorOrNull } from "@/lib/auth/session";
import { limits } from "@/lib/rate-limit";
import { DomainError, toActionError, type ActionResult } from "@/lib/errors";
import { getStorage } from "@/lib/integrations/storage";
import { deliverExternal } from "@/lib/integrations";
import { complaintCategories, type ComplaintCategory } from "@/types/domain";
import {
  acceptOffer,
  adminAssign,
  adminConfirm,
  adminDecline,
  adminRescheduleDecision,
  adminUnassign,
  cancelBooking,
  createBooking,
  declineOffer,
  getSlotAvailability,
  requestReschedule,
  technicianProgress,
  withdrawFromJob,
} from "./service";
import { confirmCompletion, disputeBooking, resolveDispute, submitCompletion } from "./completion";
import { decideEstimate, submitEstimate, withdrawEstimate } from "@/features/estimates/service";
import { submitReview } from "@/features/complaints/service";
import { recordAttachments, validateFiles, type UploadPurpose } from "@/features/uploads/service";
import { inviteBookingApprover } from "@/features/invitations/service";
import { coverageFor } from "@/features/locations/service";
import { getAppUrl } from "@/lib/config/env";

// ---------------------------------------------------------------------------
// Booking creation
// ---------------------------------------------------------------------------

export async function createBookingAction(_prev: ActionResult<{ id: string; reference: string; href: string }> | null, formData: FormData) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(str(formData, "payload"));
  } catch {
    return { ok: false as const, error: "Something went wrong reading the form. Please try again." };
  }
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  return withActor(
    async ({ actor, db }) => {
      const validated = await validateFiles(files, false); // fail fast, before creating anything
      const res = await createBooking(db, actor, payload, { anonymousId: await anonymousId() });
      if (validated.length && !res.duplicate) {
        const storage = getStorage();
        try {
          for (const f of validated) await storage.put(f.key, f.bytes, f.mime);
          await recordAttachments(db, actor, { bookingId: res.id }, "BOOKING_PHOTO", validated);
        } catch (err) {
          console.error("[booking] photo upload failed after booking", err);
          await storage.remove(validated.map((f) => f.key)).catch(() => undefined);
        }
      }
      void deliverExternal([actor.userId], "booking_received");
      const staff = payload.propertyId
        ? await db.asUser(actor.userId, (tx) =>
            tx.query(`select 1 from property_memberships where property_id = $1 and profile_id = $2 and member_role in ('OWNER','MANAGER')`, [payload.propertyId, actor.userId]),
          )
        : [];
      return { id: res.id, reference: res.reference, href: `${staff.length ? "/pm/requests" : "/account/bookings"}/${res.id}?created=1` };
    },
    { rate: { key: "booking", ...limits.bookingCreate } },
  );
}

/** Available windows for a service at a pincode, based on real technician availability. */
export async function getSlotsAction(categoryId: string, pincode: string) {
  try {
    const db = await getDb();
    const coverage = await db.asUser(null, (tx) => coverageFor(tx, pincode));
    if (coverage.status !== "SERVED" || !coverage.area) return { ok: true as const, data: { served: false, slots: [] } };
    if (!coverage.categoryIds.includes(categoryId)) return { ok: true as const, data: { served: true, categoryAvailable: false, slots: [] } };
    const slots = await getSlotAvailability(db, categoryId, coverage.area.id);
    return {
      ok: true as const,
      data: {
        served: true,
        categoryAvailable: true,
        areaName: coverage.area.name,
        slots: slots.map((s) => ({ date: s.date, windowKey: s.windowKey, start: s.start.toISOString(), end: s.end.toISOString(), remaining: s.remaining, unavailableReason: s.unavailableReason })),
      },
    };
  } catch (err) {
    return toActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Requester actions
// ---------------------------------------------------------------------------

export async function cancelBookingAction(_prev: ActionResult<{ feePaise: number }> | null, fd: FormData) {
  return withActor(({ actor, db }) => cancelBooking(db, actor, str(fd, "bookingId"), str(fd, "reason")), { success: "Booking cancelled." });
}

export async function rescheduleAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => requestReschedule(db, actor, str(fd, "bookingId"), str(fd, "date"), str(fd, "windowKey")), {
    success: "Reschedule requested. We'll confirm the new time shortly.",
  });
}

export async function decideEstimateAction(_prev: ActionResult<{ decision: string }> | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      decideEstimate(db, actor, {
        estimateId: str(fd, "estimateId"),
        decision: str(fd, "decision"),
        expectedTotalPaise: str(fd, "expectedTotalPaise"),
        reason: str(fd, "reason") || undefined,
      }),
  );
}

export async function confirmCompletionAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => confirmCompletion(db, actor, str(fd, "bookingId")), { success: "Thanks — the job is complete and your invoice is ready." });
}

export async function disputeAction(_prev: ActionResult<{ complaintId: string; reference: string }> | null, fd: FormData) {
  const category = str(fd, "category") as ComplaintCategory;
  return withActor(
    ({ actor, db }) => {
      if (!complaintCategories.includes(category)) throw new DomainError("VALIDATION", "Choose an issue type.");
      return disputeBooking(db, actor, str(fd, "bookingId"), category, str(fd, "description"));
    },
    { rate: { key: "complaint", ...limits.complaint }, success: "Issue raised. Operations will contact you." },
  );
}

export async function reviewAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => submitReview(db, actor, { bookingId: str(fd, "bookingId"), rating: str(fd, "rating"), comment: str(fd, "comment") || undefined }), {
    success: "Thanks for the feedback.",
  });
}

export async function inviteLandlordAction(_prev: ActionResult<{ link: string; expiresAt: string }> | null, fd: FormData) {
  return withActor(async ({ actor, db }) => {
    const inv = await inviteBookingApprover(db, actor, str(fd, "bookingId"));
    return { link: `${getAppUrl()}/invite/${inv.token}`, expiresAt: inv.expiresAt.toISOString() };
  });
}

export async function uploadPhotosAction(_prev: ActionResult<{ count: number }> | null, fd: FormData) {
  const purpose = str(fd, "purpose") as UploadPurpose;
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  return withActor(
    async ({ actor, db }) => {
      if (!["BOOKING_PHOTO", "BEFORE_PHOTO", "AFTER_PHOTO"].includes(purpose)) throw new DomainError("VALIDATION", "Unknown upload type.");
      if (!files.length) throw new DomainError("VALIDATION", "Choose at least one photo.");
      const validated = await validateFiles(files, false);
      const storage = getStorage();
      for (const f of validated) await storage.put(f.key, f.bytes, f.mime);
      try {
        await recordAttachments(db, actor, { bookingId: str(fd, "bookingId") }, purpose, validated);
      } catch (err) {
        await storage.remove(validated.map((f) => f.key)).catch(() => undefined);
        throw err;
      }
      return { count: validated.length };
    },
    { rate: { key: "upload", ...limits.upload }, success: "Photos added." },
  );
}

// ---------------------------------------------------------------------------
// Technician actions
// ---------------------------------------------------------------------------

export async function acceptOfferAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => acceptOffer(db, actor, str(fd, "bookingId")), { success: "Job accepted. It's now in your schedule." });
}

export async function declineOfferAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => declineOffer(db, actor, str(fd, "bookingId"), str(fd, "reason")), { success: "Offer declined. No penalty is applied." });
}

export async function withdrawAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => withdrawFromJob(db, actor, str(fd, "bookingId"), str(fd, "reason")), { success: "Job handed back to operations." });
}

export async function progressAction(_prev: ActionResult | null, fd: FormData) {
  const to = str(fd, "to");
  return withActor(({ actor, db }) => {
    if (to !== "EN_ROUTE" && to !== "IN_PROGRESS") throw new DomainError("VALIDATION", "Unknown step.");
    return technicianProgress(db, actor, str(fd, "bookingId"), to);
  });
}

export async function submitEstimateAction(_prev: ActionResult<{ estimateId: string; totalPaise: number }> | null, fd: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(str(fd, "items") || "[]");
  } catch {
    return { ok: false as const, error: "Couldn't read the line items." };
  }
  return withActor(
    ({ actor, db }) =>
      submitEstimate(db, actor, {
        bookingId: str(fd, "bookingId"),
        diagnosis: str(fd, "diagnosis"),
        items,
        validityHours: str(fd, "validityHours") || undefined,
        notes: str(fd, "notes") || undefined,
        exclusions: str(fd, "exclusions") || undefined,
      }),
    { success: "Estimate sent. The customer will review it." },
  );
}

export async function withdrawEstimateAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => withdrawEstimate(db, actor, str(fd, "estimateId")), { success: "Estimate withdrawn." });
}

export async function submitCompletionAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      submitCompletion(db, actor, {
        bookingId: str(fd, "bookingId"),
        workSummary: str(fd, "workSummary"),
        checklist: {
          workAreaCleaned: fd.get("workAreaCleaned") === "on",
          customerShownWork: fd.get("customerShownWork") === "on",
          oldPartsHandedOver: fd.get("oldPartsHandedOver") === "on",
          testedAfterRepair: fd.get("testedAfterRepair") === "on",
        },
      }),
    { success: "Completion submitted. The customer will confirm." },
  );
}

// ---------------------------------------------------------------------------
// Operations actions
// ---------------------------------------------------------------------------

export async function adminBookingAction(_prev: ActionResult | null, fd: FormData) {
  const op = str(fd, "op");
  const bookingId = str(fd, "bookingId");
  return withActor(async ({ actor, db }) => {
    switch (op) {
      case "confirm":
        return adminConfirm(db, actor, bookingId, str(fd, "note"));
      case "decline":
        return adminDecline(db, actor, bookingId, str(fd, "reason"));
      case "assign":
        return adminAssign(db, actor, bookingId, str(fd, "technicianId"), str(fd, "note"));
      case "unassign":
        return adminUnassign(db, actor, bookingId, str(fd, "reason"));
      case "approve_reschedule":
        return adminRescheduleDecision(db, actor, bookingId, true);
      case "reject_reschedule":
        return adminRescheduleDecision(db, actor, bookingId, false);
      case "close_completion":
        return confirmCompletion(db, actor, bookingId);
      case "cancel":
        await cancelBooking(db, actor, bookingId, str(fd, "reason") || "Cancelled by operations");
        return;
      case "resolve_completed":
      case "resolve_rework":
      case "resolve_cancel":
        return resolveDispute(db, actor, bookingId, op === "resolve_completed" ? "COMPLETED" : op === "resolve_rework" ? "IN_PROGRESS" : "CANCELLED", str(fd, "note"));
      default:
        throw new DomainError("VALIDATION", "Unknown operation.");
    }
  }, { success: "Saved." });
}

export async function whoAmI() {
  const a = await actorOrNull();
  return a ? { name: a.name } : null;
}
