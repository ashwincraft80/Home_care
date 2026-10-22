"use client";

import { useEffect } from "react";
import { trackClientEvent } from "@/lib/analytics/actions";
import type { AnalyticsProps } from "@/lib/analytics";

/** Records one product event when mounted (e.g. service_viewed). No personal data. */
export function TrackEvent({ name, props }: { name: string; props?: AnalyticsProps }) {
  useEffect(() => {
    void trackClientEvent(name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return null;
}
