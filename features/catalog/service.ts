import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import type { ServiceCategory } from "@/types/domain";

const CATEGORY_SELECT = `
  select id, slug, name, name_hi as "nameHi", icon, short_description as "shortDescription", description,
         common_jobs as "commonJobs", asset_types as "assetTypes", visit_fee_paise as "visitFeePaise",
         indicative_min_paise as "indicativeMinPaise", indicative_max_paise as "indicativeMaxPaise",
         warranty_days as "warrantyDays", warranty_exclusions as "warrantyExclusions", is_active as "isActive",
         sort_order as "sortOrder"
  from service_categories`;

/** Public catalogue, read as the anonymous role so RLS only returns active categories. */
export async function listActiveCategories(db: Database): Promise<ServiceCategory[]> {
  return db.asUser(null, (tx) => tx.query<ServiceCategory>(`${CATEGORY_SELECT} where is_active order by sort_order, name`));
}

export async function getCategoryBySlug(db: Database, slug: string): Promise<ServiceCategory | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  return db.asUser(null, (tx) => one<ServiceCategory>(tx, `${CATEGORY_SELECT} where slug = $1 and is_active`, [slug]));
}

export async function listAllCategoriesForAdmin(db: Database, adminId: string): Promise<ServiceCategory[]> {
  return db.asUser(adminId, (tx) => tx.query<ServiceCategory>(`${CATEGORY_SELECT} where app.is_admin() order by sort_order, name`));
}
