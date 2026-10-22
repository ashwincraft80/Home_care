"use server";

import { withActor, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { markInvoicePaid, reviewTechnician, updateCategory, updatePayoutStatus } from "./service";
import { saveArea, updateCity } from "@/features/locations/service";

export async function reviewTechnicianAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => reviewTechnician(db, actor, { technicianId: str(fd, "technicianId"), status: str(fd, "status"), notes: str(fd, "notes") }), {
    success: "Review saved and the professional was notified.",
  });
}

export async function updateCategoryAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      updateCategory(db, actor, {
        categoryId: str(fd, "categoryId"),
        visitFee: str(fd, "visitFee"),
        indicativeMin: str(fd, "indicativeMin"),
        indicativeMax: str(fd, "indicativeMax"),
        warrantyDays: str(fd, "warrantyDays"),
        warrantyExclusions: str(fd, "warrantyExclusions"),
        shortDescription: str(fd, "shortDescription"),
        isActive: fd.get("isActive") === "on",
      }),
    { success: "Saved. Existing bookings keep their original prices." },
  );
}

export async function updatePayoutAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => updatePayoutStatus(db, actor, { payoutId: str(fd, "payoutId"), status: str(fd, "status"), note: str(fd, "note") || undefined }), { success: "Payout updated." });
}

export async function markInvoicePaidAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => markInvoicePaid(db, actor, str(fd, "invoiceId")), { success: "Marked paid." });
}

export async function updateCityAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      updateCity(db, actor, {
        cityId: str(fd, "cityId"),
        status: str(fd, "status"),
        supportPhone: str(fd, "supportPhone"),
        supportEmail: str(fd, "supportEmail"),
        escalationContact: str(fd, "escalationContact"),
      }),
    { success: "City updated." },
  );
}

export async function saveAreaAction(_prev: ActionResult<{ id: string }> | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      saveArea(db, actor, {
        areaId: str(fd, "areaId") || undefined,
        cityId: str(fd, "cityId"),
        name: str(fd, "name"),
        status: str(fd, "status"),
        pincodes: str(fd, "pincodes"),
        categoryIds: fd.getAll("categoryIds").map(String),
      }),
    { success: "Service area saved." },
  );
}
