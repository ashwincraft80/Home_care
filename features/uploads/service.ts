import { randomUUID } from "node:crypto";
import { uploadPolicy } from "@/lib/config/site";
import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { canEditAsset, relationsTo } from "@/lib/permissions";
import { bookingContextFor, lockBooking, membershipOf } from "@/features/bookings/service";
import type { Actor } from "@/types/domain";

export type UploadPurpose = "BOOKING_PHOTO" | "BEFORE_PHOTO" | "AFTER_PHOTO" | "WARRANTY_DOCUMENT" | "INVOICE_DOCUMENT";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Detects the real file type from magic bytes. The browser-supplied type and name are not trusted. */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

export interface ValidatedFile {
  bytes: Uint8Array;
  mime: string;
  key: string;
  originalName: string;
}

export async function validateFiles(files: File[], allowDocuments: boolean): Promise<ValidatedFile[]> {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length > uploadPolicy.maxFilesPerUpload) {
    throw new DomainError("VALIDATION", `Upload at most ${uploadPolicy.maxFilesPerUpload} files at a time.`);
  }
  const allowed = allowDocuments ? uploadPolicy.documentTypes : uploadPolicy.imageTypes;
  const out: ValidatedFile[] = [];
  for (const f of real) {
    if (f.size > uploadPolicy.maxBytes) throw new DomainError("VALIDATION", `${f.name.slice(0, 40)} is larger than 5 MB.`);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime || !allowed.includes(mime)) {
      throw new DomainError("VALIDATION", allowDocuments ? "Only JPG, PNG, WebP or PDF files are accepted." : "Only JPG, PNG or WebP photos are accepted.");
    }
    out.push({ bytes, mime, key: `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[mime]}`, originalName: f.name.replace(/[^\w.\- ]/g, "").slice(0, 120) });
  }
  return out;
}

/** Checks the actor may attach files to the target and records metadata. Bytes are stored by the caller first. */
export async function recordAttachments(
  db: Database,
  actor: Actor,
  target: { bookingId?: string; assetId?: string },
  purpose: UploadPurpose,
  files: ValidatedFile[],
): Promise<string[]> {
  return db.transaction(async (tx) => {
    if (target.bookingId) {
      const b = await lockBooking(tx, target.bookingId);
      const ctx = await bookingContextFor(tx, b, actor.userId);
      const relations = relationsTo(actor, b, ctx);
      const isTechPhoto = purpose === "BEFORE_PHOTO" || purpose === "AFTER_PHOTO";
      const isRequesterSide = relations.includes("requester") || b.customerId === actor.userId;
      if (isTechPhoto ? !relations.includes("assigned_technician") : !isRequesterSide) {
        throw relations.length ? forbidden() : notFound("Booking not found.");
      }
      if (["COMPLETED", "CANCELLED", "DECLINED"].includes(b.status)) throw new DomainError("VALIDATION", "Photos can't be added to a closed booking.");
    } else if (target.assetId) {
      const a = await one<{ owner_id: string | null; property_id: string | null }>(tx, `select owner_id, property_id from assets where id = $1`, [target.assetId]);
      if (!a) throw notFound("Appliance not found.");
      const membership = await membershipOf(tx, a.property_id, actor.userId);
      if (!canEditAsset(actor, { ownerId: a.owner_id, propertyId: a.property_id }, membership)) throw notFound("Appliance not found.");
    } else {
      throw new DomainError("VALIDATION", "Nothing to attach to.");
    }
    const ids: string[] = [];
    for (const f of files) {
      const row = await one<{ id: string }>(
        tx,
        `insert into attachments (uploaded_by, booking_id, asset_id, purpose, storage_path, mime_type, size_bytes, original_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [actor.userId, target.bookingId ?? null, target.assetId ?? null, purpose, f.key, f.mime, f.bytes.byteLength, f.originalName],
      );
      ids.push(row!.id);
    }
    await recordAudit(tx, actor, "attachment.added", target.bookingId ? "booking" : "asset", target.bookingId ?? target.assetId ?? null, { purpose, count: files.length });
    return ids;
  });
}

/** Resolves a file for download if — and only if — RLS lets the actor see its attachment row. */
export async function attachmentForDownload(db: Database, actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return db.asUser(actor.userId, (tx) =>
    one<{ storage_path: string; mime_type: string; original_name: string | null }>(
      tx,
      `select storage_path, mime_type, original_name from attachments where id = $1`,
      [id],
    ),
  );
}
