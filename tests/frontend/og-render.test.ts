import { describe, expect, it, vi } from "vitest";

const ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "T".repeat(43);
const report = {
  headline_verdict: "Your challenger wins 12 of 15",
  winner: "B",
  scorecard: {
    n_approved: 15, prefer_a: 3, prefer_b: 12, clarity_a: 4.1, clarity_b: 5.6, intent_a: 3.9, intent_b: 5.2,
    understanding_rate_a: 0.6, understanding_rate_b: 0.87,
  },
  top_fixes: [{ title: "Say who", detail: "Unclear.", evidence_quotes: [{ response_id: ID, text: "no idea who it is for", juror_label: "Juror 2" }] }],
  winning_copy: { headline: "Hello there", subheadline: "Sub line", bullets: ["one", "two", "three"], cta: "Go" },
  rewritten_headline: null,
  still_unsolved: [],
  method_caveats: "15 real people, directional signal, not a sales guarantee.",
};

vi.mock("@/lib/queries", () => ({
  getOgOrder: async () => ({ id: ID, token: TOKEN, report_public: true, has_report: true, report }),
}));

import { GET } from "@/app/api/og/verdict/[token]/route";

describe("OG verdict card render", () => {
  it("renders a 1200x630 PNG for a public card", async () => {
    const res = await GET(new Request(`https://x/api/og/verdict/${ID}`), { params: Promise.resolve({ token: ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = new Uint8Array(await res.arrayBuffer());
    // PNG IHDR width/height at bytes 16..23
    const dv = new DataView(buf.buffer);
    expect(dv.getUint32(16)).toBe(1200);
    expect(dv.getUint32(20)).toBe(630);
  }, 30000);
});
