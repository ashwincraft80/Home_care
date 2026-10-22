import type { Queryable } from "@/lib/database/types";

/**
 * Internal analytics abstraction. Events are stored in analytics_events and can be forwarded to a
 * provider later by implementing AnalyticsSink. Never pass names, phone numbers, addresses, emails,
 * free text or database ids of people in properties.
 */
export const analyticsEventNames = [
  "service_viewed",
  "service_category_selected",
  "home_explorer_opened",
  "booking_failed",
  "unavailable_area_encountered",
  "booking_started",
  "booking_submitted",
  "booking_cancelled",
  "technician_assigned",
  "estimate_submitted",
  "estimate_approved",
  "estimate_rejected",
  "job_completed",
  "complaint_created",
  "repeat_booking_started",
] as const;
export type AnalyticsEventName = (typeof analyticsEventNames)[number];

export type AnalyticsProps = Record<string, string | number | boolean | null>;

const ALLOWED_PROP_KEYS = new Set([
  "category",
  "status",
  "is_repeat",
  "is_property",
  "role",
  "step",
  "has_photos",
  "line_items",
  "kind",
  "source",
  "fee_applied",
  "city",
  "occupancy",
  "cost_approval",
  "reason",
  "surface",
]);

/** Drops any property not on the allow-list, and any string that looks like contact data. */
export function sanitizeProps(props: AnalyticsProps = {}): AnalyticsProps {
  const clean: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (!ALLOWED_PROP_KEYS.has(key)) continue;
    if (typeof value === "string" && (value.length > 60 || /@|\d{6,}/.test(value))) continue;
    clean[key] = value;
  }
  return clean;
}

export interface AnalyticsSink {
  send(name: AnalyticsEventName, props: AnalyticsProps): Promise<void>;
}

/** No external provider is configured in V1. Replace with a real sink when one is chosen. */
const sinks: AnalyticsSink[] = [];

export async function track(
  tx: Queryable,
  name: AnalyticsEventName,
  props: AnalyticsProps = {},
  anonymousId: string | null = null,
): Promise<void> {
  const clean = sanitizeProps(props);
  await tx.query(`insert into analytics_events (name, anonymous_id, properties) values ($1, $2, $3::jsonb)`, [
    name,
    anonymousId && /^[a-zA-Z0-9-]{8,64}$/.test(anonymousId) ? anonymousId : null,
    JSON.stringify(clean),
  ]);
  for (const sink of sinks) {
    sink.send(name, clean).catch((e) => console.warn("[analytics] sink failed", e));
  }
}
