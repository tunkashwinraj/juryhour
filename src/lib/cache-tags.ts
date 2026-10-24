// Cached marketing data (Cache Components "use cache" + cacheTag) refreshed when the facts change.
import { revalidateTag } from "next/cache";

export type CacheTag = "prices" | "company_state" | "counters";

/** Marks a tag stale. Outside a Next request (tests, scripts) there is no cache to refresh. */
export function refreshTag(tag: CacheTag): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    /* no request scope */
  }
}
