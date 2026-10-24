import { describe, expect, it } from "vitest";
import {
  ageText,
  canViewOg,
  cardToText,
  etaText,
  formatDuration,
  funnelBySrc,
  isValidToken,
  maskEmail,
  normalizeSrc,
  pct,
  progressSteps,
  refundNotice,
  shareOnXUrl,
  summarizeLedger,
  tallyMarks,
  upgradeCredit,
  usd,
} from "@/components/rules";

const TOKEN = "a".repeat(43);
const ID = "11111111-2222-3333-4444-555555555555";

describe("tokens and src", () => {
  it("accepts 32+ char base64url tokens only", () => {
    expect(isValidToken(TOKEN)).toBe(true);
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("a".repeat(31))).toBe(false);
    expect(isValidToken("a".repeat(40) + "/..")).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
  });

  it("normalizes src tags", () => {
    expect(normalizeSrc(" Reddit_SaaS ")).toBe("reddit_saas");
    expect(normalizeSrc("x<script>")).toBeNull();
    expect(normalizeSrc(null)).toBeNull();
    expect(normalizeSrc("a".repeat(60))).toBeNull();
  });
});

describe("money and time", () => {
  it("formats dollars", () => {
    expect(usd(149)).toBe("$149");
    expect(usd(4.5)).toBe("$4.50");
    expect(usd(-3.2)).toBe("-$3.20");
    expect(usd(null)).toBe("–");
    expect(usd(10, { cents: true })).toBe("$10.00");
  });

  it("formats durations", () => {
    expect(formatDuration(30_000)).toBe("<1m");
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(200 * 60_000)).toBe("3h 20m");
    expect(formatDuration(120 * 60_000)).toBe("2h");
    expect(formatDuration((52 * 60 + 5) * 60_000)).toBe("2d 4h");
  });

  it("computes ETA from deadline_at", () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    expect(etaText("2026-10-24T15:20:00Z", now)).toBe("Verdict due within 3h 20m.");
    expect(etaText("2026-10-24T11:00:00Z", now)).toMatch(/Past the deadline/);
    expect(etaText(null, now)).toBeNull();
    expect(etaText("garbage", now)).toBeNull();
  });

  it("ages", () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    expect(ageText("2026-10-24T11:15:00Z", now)).toBe("45m");
    expect(ageText(null, now)).toBe("–");
  });
});

describe("order progress", () => {
  it("marks steps for a live panel", () => {
    const s = progressSteps({ stage: "PANEL_LIVE", tier: "proof", approvedN: 6, requestedN: 15 });
    expect(s.map((x) => x.state)).toEqual(["done", "done", "done", "active", "todo"]);
    expect(s[3].label).toContain("6 of 15");
    expect(s[2].label).toContain("challenger");
  });

  it("uses the tier juror count before a panel exists, and 'test' wording for spark/pulse", () => {
    const s = progressSteps({ stage: "RESEARCHING", tier: "pulse", approvedN: 0, requestedN: null });
    expect(s[3].label).toContain("0 of 10");
    expect(s[2].label).toContain("Writing your test");
    expect(s.map((x) => x.state)).toEqual(["done", "active", "todo", "todo", "todo"]);
  });

  it("completes on delivery and blanks on refund", () => {
    expect(progressSteps({ stage: "DELIVERED", tier: "spark", approvedN: 3, requestedN: 3 }).every((x) => x.state === "done")).toBe(true);
    expect(progressSteps({ stage: "REFUNDED", tier: "spark", approvedN: 0, requestedN: 3 }).every((x) => x.state === "todo")).toBe(true);
  });

  it("never shows more done jurors than requested", () => {
    const s = progressSteps({ stage: "GRADING", tier: "spark", approvedN: 5, requestedN: 3 });
    expect(s[3].label).toContain("3 of 3");
  });

  it("writes refund notices", () => {
    expect(refundNotice({ stage: "REFUNDED", refundUsd: 49 })).toContain("$49");
    expect(refundNotice({ stage: "PARTIAL", refundUsd: 9.93 })).toContain("$9.93");
    expect(refundNotice({ stage: "PANEL_LIVE", refundUsd: 0 })).toBeNull();
    expect(refundNotice({ stage: "BLOCKED", refundUsd: 0 })).toBe("We can't test this product.");
  });
});

describe("OG access rule", () => {
  const order = { id: ID, token: TOKEN, report_public: false, has_report: true };

  it("lets the token holder see the card", () => {
    expect(canViewOg({ ref: TOKEN, t: null, order })).toBe(true);
  });
  it("hides a private card addressed by id", () => {
    expect(canViewOg({ ref: ID, t: null, order })).toBe(false);
    expect(canViewOg({ ref: ID, t: "wrong", order })).toBe(false);
  });
  it("shows it by id when ?t= carries the token or the owner opted in", () => {
    expect(canViewOg({ ref: ID, t: TOKEN, order })).toBe(true);
    expect(canViewOg({ ref: ID, t: null, order: { ...order, report_public: true } })).toBe(true);
  });
  it("never shows a card without a delivered report", () => {
    expect(canViewOg({ ref: TOKEN, t: null, order: { ...order, has_report: false } })).toBe(false);
    expect(canViewOg({ ref: TOKEN, t: null, order: null })).toBe(false);
  });
  it("rejects a ref that matches neither id nor token", () => {
    expect(canViewOg({ ref: "b".repeat(43), t: TOKEN, order: { ...order, report_public: true } })).toBe(false);
  });
});

describe("ledger summary", () => {
  const rows = [
    { mode: "live" as const, kind: "revenue", amount_usd: "149.00" },
    { mode: "live" as const, kind: "revenue", amount_usd: 11 },
    { mode: "live" as const, kind: "refund", amount_usd: -11 },
    { mode: "live" as const, kind: "terac_cost", amount_usd: -45 },
    { mode: "live" as const, kind: "ai_cost", amount_usd: -0.42 },
    { mode: "live" as const, kind: "exa_cost", amount_usd: -0.08 },
    { mode: "live" as const, kind: "whop_fee", amount_usd: -4.62 },
    { mode: "sandbox" as const, kind: "revenue", amount_usd: 999 },
  ];

  it("keeps live and sandbox separate", () => {
    expect(summarizeLedger(rows, "sandbox").revenue).toBe(999);
    expect(summarizeLedger(rows, "live").revenue).toBe(160);
  });

  it("computes net and gross margin on net revenue", () => {
    const s = summarizeLedger(rows, "live");
    expect(s.refunds).toBe(11);
    expect(s.teracCost).toBe(45);
    expect(s.net).toBe(98.88); // 149 - 45 - .42 - .08 - 4.62
    expect(s.grossMargin).toBeCloseTo(98.88 / 149, 3);
  });

  it("has no margin without revenue", () => {
    expect(summarizeLedger([], "live").grossMargin).toBeNull();
  });
});

describe("funnel by src", () => {
  it("groups previews, checkouts and paid orders by channel", () => {
    const f = funnelBySrc(
      [{ src: "reddit" }, { src: "reddit" }, { src: null }, { src: "x" }],
      [
        { src: "reddit", paid_at: "2026-10-24T12:00:00Z", mode: "live" },
        { src: "reddit", paid_at: null, mode: "live" },
        { src: null, paid_at: "2026-10-24T12:00:00Z", mode: "sandbox" },
      ],
    );
    const reddit = f.find((r) => r.src === "reddit")!;
    expect(reddit).toEqual({ src: "reddit", previews: 2, checkouts: 2, paidLive: 1, paidSandbox: 0 });
    const direct = f.find((r) => r.src === "direct")!;
    expect(direct).toEqual({ src: "direct", previews: 1, checkouts: 1, paidLive: 0, paidSandbox: 1 });
    expect(f[0].src).toBe("reddit");
    expect(pct(reddit.paidLive, reddit.previews)).toBe("50%");
    expect(pct(1, 0)).toBe("–");
  });
});

describe("report helpers", () => {
  it("draws a tally with B first, then A, then empties", () => {
    expect(tallyMarks(2, 3, 6)).toEqual(["B", "B", "B", "A", "A", "none"]);
    expect(tallyMarks(null, null, 2)).toEqual(["none", "none"]);
  });

  it("computes Spark upgrade credit within the window only", () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    const ok = upgradeCredit({ paidAtIso: "2026-10-24T02:00:00Z", sparkPaid: 11, proofPrice: 149, nowMs: now, windowHours: 24 });
    expect(ok).toEqual({ eligible: true, credit: 11, due: 138, hoursLeft: 14 });
    const late = upgradeCredit({ paidAtIso: "2026-10-22T02:00:00Z", sparkPaid: 11, proofPrice: 149, nowMs: now, windowHours: 24 });
    expect(late.eligible).toBe(false);
    expect(late.due).toBe(149);
    expect(upgradeCredit({ paidAtIso: null, sparkPaid: 11, proofPrice: 149, nowMs: now, windowHours: 24 }).eligible).toBe(false);
  });

  it("builds copyable text from a card", () => {
    const t = cardToText({ headline: "H", subheadline: "S", bullets: ["a", "b", "c"], cta: "Go" });
    expect(t).toBe("H\n\nS\n\n• a\n• b\n• c\n\nGo");
  });

  it("share link never carries the private token", () => {
    const u = shareOnXUrl({ verdict: "B wins 12 of 15", n: 15, appUrl: "https://juryhour.test/" });
    expect(u.startsWith("https://x.com/intent/post?")).toBe(true);
    expect(decodeURIComponent(u)).toContain("15 real people");
    expect(decodeURIComponent(u)).toContain("https://juryhour.test/?src=x_share");
  });

  it("masks emails", () => {
    expect(maskEmail("jane@acme.com")).toBe("j•••@acme.com");
    expect(maskEmail(null)).toBe("–");
  });
});
