"use server";

import { getDb } from "@/lib/database";
import { anonymousId, clientIp } from "@/lib/auth/session";
import { checkRateLimit, limits } from "@/lib/rate-limit";
import { analyticsEventNames, track, type AnalyticsEventName, type AnalyticsProps } from "./index";

/** Browser-originated product events. Only allow-listed names and properties are stored. */
const CLIENT_EVENTS: AnalyticsEventName[] = ["service_viewed", "service_category_selected", "home_explorer_opened", "booking_started", "repeat_booking_started", "booking_failed"];

export async function trackClientEvent(name: string, props: AnalyticsProps = {}): Promise<void> {
  if (!analyticsEventNames.includes(name as AnalyticsEventName) || !CLIENT_EVENTS.includes(name as AnalyticsEventName)) return;
  const ip = await clientIp();
  if (!checkRateLimit(`analytics:${ip}`, limits.analytics.limit, limits.analytics.windowMs)) return;
  try {
    const db = await getDb();
    const aid = await anonymousId();
    await db.transaction((tx) => track(tx, name as AnalyticsEventName, props, aid));
  } catch (err) {
    console.warn("[analytics] dropped event", name, err instanceof Error ? err.message : err);
  }
}
