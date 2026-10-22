"use server";

import { redirect } from "next/navigation";
import { withActor, str } from "@/lib/actions";
import { limits } from "@/lib/rate-limit";
import { DomainError } from "@/lib/errors";
import { getStorage } from "@/lib/integrations/storage";
import { recordAttachments, validateFiles } from "@/features/uploads/service";
import { addMaintenanceRecord, createAsset, deleteAsset, deleteMaintenanceRecord, updateAsset } from "./service";
import type { ActionResult } from "@/lib/errors";

const assetFields = (fd: FormData) => ({
  assetType: str(fd, "assetType"),
  nickname: str(fd, "nickname"),
  brand: str(fd, "brand"),
  model: str(fd, "model"),
  locationInHome: str(fd, "locationInHome"),
  installedOn: str(fd, "installedOn"),
  warrantyExpiresOn: str(fd, "warrantyExpiresOn"),
  notes: str(fd, "notes"),
  unitId: str(fd, "unitId") || undefined,
});

export async function createAssetAction(_prev: ActionResult<{ id: string }> | null, fd: FormData) {
  const propertyId = str(fd, "propertyId") || undefined;
  const res = await withActor(({ actor, db }) => createAsset(db, actor, { ...assetFields(fd), propertyId }));
  if (res.ok) redirect(propertyId ? `/pm/properties/${propertyId}` : `/account/assets/${res.data.id}`);
  return res;
}

export async function updateAssetAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => updateAsset(db, actor, str(fd, "assetId"), assetFields(fd)), { success: "Saved." });
}

export async function deleteAssetAction(_prev: ActionResult | null, fd: FormData) {
  const res = await withActor(async ({ actor, db }) => {
    const { storagePaths } = await deleteAsset(db, actor, str(fd, "assetId"));
    await getStorage().remove(storagePaths).catch(() => undefined);
  });
  if (res.ok) redirect(str(fd, "returnTo") || "/account/assets");
  return res;
}

export async function addRecordAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      addMaintenanceRecord(db, actor, {
        assetId: str(fd, "assetId"),
        performedOn: str(fd, "performedOn"),
        title: str(fd, "title"),
        details: str(fd, "details"),
        costRupees: str(fd, "costRupees"),
      }),
    { success: "Record added." },
  );
}

export async function deleteRecordAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => deleteMaintenanceRecord(db, actor, str(fd, "recordId")), { success: "Record deleted." });
}

export async function uploadAssetDocAction(_prev: ActionResult | null, fd: FormData) {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  return withActor(
    async ({ actor, db }) => {
      if (!files.length) throw new DomainError("VALIDATION", "Choose a file to upload.");
      const validated = await validateFiles(files, true);
      const storage = getStorage();
      for (const f of validated) await storage.put(f.key, f.bytes, f.mime);
      try {
        await recordAttachments(db, actor, { assetId: str(fd, "assetId") }, str(fd, "purpose") === "INVOICE_DOCUMENT" ? "INVOICE_DOCUMENT" : "WARRANTY_DOCUMENT", validated);
      } catch (err) {
        await storage.remove(validated.map((f) => f.key)).catch(() => undefined);
        throw err;
      }
    },
    { rate: { key: "upload", ...limits.upload }, success: "Document uploaded." },
  );
}
