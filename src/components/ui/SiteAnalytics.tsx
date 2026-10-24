"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsEvent } from "./analytics-url";

/** Vercel Web Analytics with private links (/o, /r, /t, /preview) redacted before sending. */
export function SiteAnalytics() {
  return <Analytics beforeSend={redactAnalyticsEvent} />;
}
