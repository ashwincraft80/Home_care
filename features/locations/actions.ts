"use server";

import { getDb } from "@/lib/database";
import { actorOrNull, anonymousId, clientIp } from "@/lib/auth/session";
import { assertRateLimit, limits } from "@/lib/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { checkCoverage, joinWaitlist, type CoverageStatus } from "./service";
import { listActiveCategories } from "@/features/catalog/service";

export interface CoverageResult {
  pincode: string;
  status: CoverageStatus;
  areaName: string | null;
  cityName: string | null;
  serviceAreaId: string | null;
  categories: { id: string; slug: string; name: string }[];
}

export async function checkPincodeAction(pincode: string, categorySlug?: string): Promise<ActionResult<CoverageResult>> {
  try {
    assertRateLimit(`coverage:${await clientIp()}`, 60, 60_000);
    const db = await getDb();
    const cov = await checkCoverage(db, pincode, { anonymousId: await anonymousId(), categorySlug });
    const cats = cov.status === "SERVED" ? (await listActiveCategories(db)).filter((c) => cov.categoryIds.includes(c.id)) : [];
    return {
      ok: true,
      data: {
        pincode: cov.pincode,
        status: cov.status,
        areaName: cov.area?.name ?? null,
        cityName: cov.city?.name ?? null,
        serviceAreaId: cov.status === "SERVED" ? (cov.area?.id ?? null) : null,
        categories: cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      },
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function joinWaitlistAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    assertRateLimit(`waitlist:${await clientIp()}`, limits.complaint.limit, limits.complaint.windowMs);
    const db = await getDb();
    await joinWaitlist(db, await actorOrNull(), {
      pincode: String(formData.get("pincode") ?? ""),
      categoryId: formData.get("categoryId") ? String(formData.get("categoryId")) : undefined,
      email: String(formData.get("email") ?? ""),
      consent: formData.get("consent") === "on",
    });
    return { ok: true, data: undefined, message: "Thanks — we'll only use this to tell you when we start serving your area." };
  } catch (err) {
    return toActionError(err);
  }
}
