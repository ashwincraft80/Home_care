import { serviceGuidance, type AssetType } from "@/lib/config/catalog";
import type { Database, Queryable } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { rupeesToPaise } from "@/lib/money";
import { canEditAsset, canManageProperty } from "@/lib/permissions";
import { assetInputSchema, maintenanceRecordInputSchema, parseOrThrow } from "@/lib/validation";
import { addDays, localDateKey } from "@/lib/time";
import { membershipOf } from "@/features/bookings/service";
import type { Actor } from "@/types/domain";
import { z } from "zod";

export interface AssetRow {
  id: string;
  ownerId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  unitId: string | null;
  unitLabel: string | null;
  assetType: AssetType;
  nickname: string;
  brand: string | null;
  model: string | null;
  locationInHome: string | null;
  installedOn: string | null;
  warrantyExpiresOn: string | null;
  notes: string | null;
  lastServicedOn: string | null;
  recordCount: number;
}

export interface ServiceSuggestion {
  nextServiceOn: string | null;
  basis: "last_service" | "installation" | "none";
  note: string;
  overdue: boolean;
}

/** Next recommended service date from HomeCare's configured guidance (not manufacturer claims). */
export function nextServiceSuggestion(
  asset: Pick<AssetRow, "assetType" | "lastServicedOn" | "installedOn">,
  today: string = localDateKey(new Date()),
): ServiceSuggestion {
  const guidance = serviceGuidance[asset.assetType];
  if (!guidance?.intervalDays) return { nextServiceOn: null, basis: "none", note: guidance?.note ?? "", overdue: false };
  const from = asset.lastServicedOn ?? asset.installedOn;
  if (!from) return { nextServiceOn: null, basis: "none", note: guidance.note, overdue: false };
  const next = addDays(from, guidance.intervalDays);
  return { nextServiceOn: next, basis: asset.lastServicedOn ? "last_service" : "installation", note: guidance.note, overdue: next < today };
}

const ASSET_SELECT = `
  select a.id, a.owner_id as "ownerId", a.property_id as "propertyId", pr.name as "propertyName", a.unit_id as "unitId",
         u.label as "unitLabel", a.asset_type as "assetType", a.nickname, a.brand, a.model, a.location_in_home as "locationInHome",
         a.installed_on::text as "installedOn", a.warranty_expires_on::text as "warrantyExpiresOn", a.notes,
         (select max(performed_on)::text from maintenance_records m where m.asset_id = a.id) as "lastServicedOn",
         (select count(*)::int from maintenance_records m where m.asset_id = a.id) as "recordCount"
  from assets a left join properties pr on pr.id = a.property_id left join property_units u on u.id = a.unit_id`;

export async function listMyAssets(db: Database, actor: Actor): Promise<AssetRow[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<AssetRow>(`${ASSET_SELECT} where a.owner_id = $1 order by a.created_at desc`, [actor.userId]),
  );
}

export async function listPropertyAssets(db: Database, actor: Actor, propertyId: string): Promise<AssetRow[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<AssetRow>(`${ASSET_SELECT} where a.property_id = $1 order by u.label nulls first, a.nickname`, [propertyId]),
  );
}

export interface MaintenanceRecordRow {
  id: string;
  assetId: string | null;
  assetNickname: string | null;
  bookingId: string | null;
  bookingReference: string | null;
  source: "JOB" | "SELF_REPORTED";
  performedOn: string;
  title: string;
  details: string | null;
  costPaise: number | null;
  createdBy: string;
}

const RECORD_SELECT = `
  select m.id, m.asset_id as "assetId", a.nickname as "assetNickname", m.booking_id as "bookingId", b.reference as "bookingReference",
         m.source, m.performed_on::text as "performedOn", m.title, m.details, m.cost_paise as "costPaise", m.created_by as "createdBy"
  from maintenance_records m left join assets a on a.id = m.asset_id left join bookings b on b.id = m.booking_id`;

export async function getAssetDetail(db: Database, actor: Actor, assetId: string) {
  if (!z.uuid().safeParse(assetId).success) return null;
  return db.asUser(actor.userId, async (tx) => {
    const asset = await one<AssetRow>(tx, `${ASSET_SELECT} where a.id = $1`, [assetId]);
    if (!asset) return null;
    const records = await tx.query<MaintenanceRecordRow>(`${RECORD_SELECT} where m.asset_id = $1 order by m.performed_on desc, m.created_at desc`, [assetId]);
    const documents = await tx.query<{ id: string; purpose: string; originalName: string | null; mimeType: string; createdAt: Date }>(
      `select id, purpose, original_name as "originalName", mime_type as "mimeType", created_at as "createdAt"
       from attachments where asset_id = $1 order by created_at desc`,
      [assetId],
    );
    const membership = asset.propertyId ? await one<{ member_role: string }>(tx, `select member_role from property_memberships where property_id = $1 and profile_id = $2`, [asset.propertyId, actor.userId]) : null;
    const canEdit = asset.ownerId === actor.userId || membership?.member_role === "OWNER" || membership?.member_role === "MANAGER";
    return { asset, records, documents, canEdit };
  });
}

export async function listMaintenanceRecords(db: Database, actor: Actor): Promise<MaintenanceRecordRow[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<MaintenanceRecordRow>(`${RECORD_SELECT} where m.owner_id = $1 order by m.performed_on desc, m.created_at desc`, [actor.userId]),
  );
}

async function loadAssetForEdit(tx: Queryable, actor: Actor, assetId: string) {
  if (!z.uuid().safeParse(assetId).success) throw notFound("Appliance not found.");
  const a = await one<{ owner_id: string | null; property_id: string | null }>(tx, `select owner_id, property_id from assets where id = $1 for update`, [assetId]);
  if (!a) throw notFound("Appliance not found.");
  const membership = await membershipOf(tx, a.property_id, actor.userId);
  if (!canEditAsset(actor, { ownerId: a.owner_id, propertyId: a.property_id }, membership)) {
    if (a.owner_id !== actor.userId && !membership) throw notFound("Appliance not found.");
    throw forbidden("You can view this appliance but not change it.");
  }
  return a;
}

export async function createAsset(db: Database, actor: Actor, rawInput: unknown): Promise<{ id: string }> {
  const input = parseOrThrow(assetInputSchema, rawInput);
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      if (input.propertyId) {
        const m = await membershipOf(tx, input.propertyId, actor.userId);
        if (!canManageProperty(m)) throw forbidden("You can't add appliances to this property.");
        if (input.unitId) {
          const u = await one(tx, `select 1 from property_units where id = $1 and property_id = $2`, [input.unitId, input.propertyId]);
          if (!u) throw new DomainError("VALIDATION", "Choose a unit in this property.");
        }
      }
      const row = await one<{ id: string }>(
        tx,
        `insert into assets (owner_id, property_id, unit_id, asset_type, nickname, brand, model, location_in_home, installed_on,
           warranty_expires_on, notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [
          input.propertyId ? null : actor.userId,
          input.propertyId ?? null,
          input.propertyId ? (input.unitId ?? null) : null,
          input.assetType,
          input.nickname,
          input.brand ?? null,
          input.model ?? null,
          input.locationInHome ?? null,
          input.installedOn ?? null,
          input.warrantyExpiresOn ?? null,
          input.notes ?? null,
          actor.userId,
        ],
      );
      await recordAudit(tx, actor, "asset.created", "asset", row!.id, { assetType: input.assetType });
      return { id: row!.id };
    }),
  );
}

export async function updateAsset(db: Database, actor: Actor, assetId: string, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(assetInputSchema.omit({ propertyId: true }), rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const a = await loadAssetForEdit(tx, actor, assetId);
      if (input.unitId && a.property_id) {
        const u = await one(tx, `select 1 from property_units where id = $1 and property_id = $2`, [input.unitId, a.property_id]);
        if (!u) throw new DomainError("VALIDATION", "Choose a unit in this property.");
      }
      await tx.query(
        `update assets set asset_type = $2, nickname = $3, brand = $4, model = $5, location_in_home = $6, installed_on = $7,
           warranty_expires_on = $8, notes = $9, unit_id = $10 where id = $1`,
        [
          assetId,
          input.assetType,
          input.nickname,
          input.brand ?? null,
          input.model ?? null,
          input.locationInHome ?? null,
          input.installedOn ?? null,
          input.warrantyExpiresOn ?? null,
          input.notes ?? null,
          a.property_id ? (input.unitId ?? null) : null,
        ],
      );
      await recordAudit(tx, actor, "asset.updated", "asset", assetId);
    }),
  );
}

/** Deletes an appliance and its self-reported records. Job records are kept (business records) but unlinked. */
export async function deleteAsset(db: Database, actor: Actor, assetId: string): Promise<{ storagePaths: string[] }> {
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      await loadAssetForEdit(tx, actor, assetId);
      const files = await tx.query<{ storage_path: string }>(`select storage_path from attachments where asset_id = $1`, [assetId]);
      await tx.query(`delete from maintenance_records where asset_id = $1 and source = 'SELF_REPORTED'`, [assetId]);
      await tx.query(`delete from assets where id = $1`, [assetId]);
      await recordAudit(tx, actor, "asset.deleted", "asset", assetId);
      return { storagePaths: files.map((f) => f.storage_path) };
    }),
  );
}

export async function addMaintenanceRecord(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(maintenanceRecordInputSchema, rawInput);
  if (input.performedOn > localDateKey(new Date())) throw new DomainError("VALIDATION", "The date can't be in the future.", { performedOn: ["Future date"] });
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const a = await loadAssetForEdit(tx, actor, input.assetId);
      await tx.query(
        `insert into maintenance_records (asset_id, owner_id, property_id, source, performed_on, title, details, cost_paise, created_by)
         values ($1,$2,$3,'SELF_REPORTED',$4,$5,$6,$7,$8)`,
        [input.assetId, a.owner_id, a.property_id, input.performedOn, input.title, input.details ?? null, input.costRupees ? rupeesToPaise(input.costRupees) : null, actor.userId],
      );
      await recordAudit(tx, actor, "maintenance_record.created", "asset", input.assetId);
    }),
  );
}

/** Only self-reported records can be deleted; job records are part of the service history. */
export async function deleteMaintenanceRecord(db: Database, actor: Actor, recordId: string): Promise<void> {
  if (!z.uuid().safeParse(recordId).success) throw notFound();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const r = await one<{ source: string; owner_id: string | null; property_id: string | null }>(
        tx,
        `select source, owner_id, property_id from maintenance_records where id = $1 for update`,
        [recordId],
      );
      if (!r) throw notFound("Record not found.");
      const membership = await membershipOf(tx, r.property_id, actor.userId);
      if (!canEditAsset(actor, { ownerId: r.owner_id, propertyId: r.property_id }, membership)) throw notFound("Record not found.");
      if (r.source !== "SELF_REPORTED") throw new DomainError("VALIDATION", "Records created from HomeCare jobs can't be deleted. Contact support if something is wrong.");
      await tx.query(`delete from maintenance_records where id = $1`, [recordId]);
      await recordAudit(tx, actor, "maintenance_record.deleted", "maintenance_record", recordId);
    }),
  );
}

export async function assetsForBooking(db: Database, actor: Actor, propertyId?: string | null) {
  return db.asUser(actor.userId, (tx) =>
    tx.query<{ id: string; nickname: string; assetType: AssetType; unitId: string | null }>(
      propertyId
        ? `select id, nickname, asset_type as "assetType", unit_id as "unitId" from assets where property_id = $1 order by nickname`
        : `select id, nickname, asset_type as "assetType", unit_id as "unitId" from assets where owner_id = $1 order by nickname`,
      [propertyId ?? actor.userId],
    ),
  );
}
