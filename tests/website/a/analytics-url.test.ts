import { describe, expect, it } from "vitest";
import { redactAnalyticsEvent, redactPrivateUrl } from "@/components/ui/analytics-url";

describe("redactPrivateUrl", () => {
  it.each([
    ["/o/AbC_123-xyzAbC_123-xyzAbC_123-xyz", "/o/[token]"],
    ["/r/tok123?share=1#fixes", "/r/[token]"],
    ["/t/7d9c3f1e-0000-4000-8000-000000000000?PROLIFIC=1", "/t/[id]"],
    ["/preview/abc", "/preview/[id]"],
    ["/o/tok/extra", "/o/[token]/extra"],
    ["https://juryhour.vercel.app/r/secret?x=1", "https://juryhour.vercel.app/r/[token]"],
    ["https://juryhour.com/o/secret", "https://juryhour.com/o/[token]"],
  ])("%s → %s", (input, out) => {
    expect(redactPrivateUrl(input)).toBe(out);
  });

  it.each([
    "/",
    "/pricing?code=TODAY99",
    "https://juryhour.com/for/agencies?src=x",
    "/o",
    "/o/",
    "/ops",
    "/ops?filter=open",
    "/order/abc",
    "/blog/the-t/thing",
  ])("leaves %s alone", (u) => {
    expect(redactPrivateUrl(u)).toBe(u);
  });

  it("keeps the event type", () => {
    expect(redactAnalyticsEvent({ type: "pageview" as const, url: "/r/x?y=1" })).toEqual({ type: "pageview", url: "/r/[token]" });
  });
});
