import { describe, expect, it } from "vitest";
import { buildFunnel, DIRECT_SRC, normalizeSrc, pickSrc, readSrc, SRC_COOKIE, srcCookie, srcFromUrl } from "@/lib/analytics";

const jar = (v?: string) => ({ get: (name: string) => (name === SRC_COOKIE && v !== undefined ? { value: v } : undefined) });

describe("normalizeSrc", () => {
  it.each([
    ["twitter", "twitter"],
    ["  Reddit_Ads-2 ", "reddit_ads-2"],
    ["X", "x"],
    ["a".repeat(40), "a".repeat(40)],
  ])("accepts %j → %j", (raw, want) => expect(normalizeSrc(raw)).toBe(want));

  it.each([["a".repeat(41)], [""], ["   "], ["has space"], ["<script>"], ["utm.source"], ["ü"], ["a/b"], [null], [undefined], [42], [{}]])(
    "rejects %j",
    (raw) => expect(normalizeSrc(raw)).toBeNull(),
  );
});

describe("readSrc / pickSrc / srcFromUrl / srcCookie", () => {
  it("reads and normalizes the cookie", () => {
    expect(SRC_COOKIE).toBe("jh_src");
    expect(readSrc(jar("HN"))).toBe("hn");
    expect(readSrc(jar("bad value"))).toBeNull();
    expect(readSrc(jar())).toBeNull();
    expect(readSrc(null)).toBeNull();
    expect(readSrc({ get: () => { throw new Error("x"); } })).toBeNull();
  });
  it("body src beats cookie when valid", () => {
    expect(pickSrc("whop", jar("hn"))).toBe("whop");
    expect(pickSrc("bad value!", jar("hn"))).toBe("hn");
  });
  it("srcFromUrl", () => {
    expect(srcFromUrl("https://juryhour.test/?src=Lovable")).toBe("lovable");
    expect(srcFromUrl("https://juryhour.test/")).toBeNull();
    expect(srcFromUrl("not a url")).toBeNull();
  });
  it("cookie options", () => {
    expect(srcCookie("hn")).toMatchObject({ name: "jh_src", value: "hn", path: "/", sameSite: "lax", httpOnly: true, secure: true });
  });
});

describe("buildFunnel", () => {
  it("groups previews → checkouts → paid by src, live only when asked", () => {
    const rows = buildFunnel(
      [{ src: "hn" }, { src: "hn" }, { src: "HN" }, { src: null }, { src: "x" }],
      [
        { src: "hn", paid_at: "2026-10-24T00:00:00Z", mode: "live" },
        { src: "hn", paid_at: null, mode: "live" },
        { src: "hn", paid_at: "2026-10-24T00:00:00Z", mode: "sandbox" },
        { src: null, paid_at: "2026-10-24T00:00:00Z", mode: "live" },
      ],
      { mode: "live" },
    );
    expect(rows).toEqual([
      { src: "hn", previews: 3, checkouts: 2, paid: 1, previewToPaid: 0.3333, checkoutToPaid: 0.5 },
      { src: DIRECT_SRC, previews: 1, checkouts: 1, paid: 1, previewToPaid: 1, checkoutToPaid: 1 },
      { src: "x", previews: 1, checkouts: 0, paid: 0, previewToPaid: 0, checkoutToPaid: null },
    ]);
  });
  it("empty input", () => expect(buildFunnel([], [])).toEqual([]));
});
