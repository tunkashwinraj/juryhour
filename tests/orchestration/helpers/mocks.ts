// vi.fn stand-ins for sibling workstream modules (B whop, C terac, D llm/agents, F email, lead exa).
// Usage in a test file:
//   vi.mock("@/lib/whop", async () => (await import("./helpers/mocks")).whopModule);
import { vi } from "vitest";

let seq = 0;
const next = (p: string) => `${p}_${++seq}`;

export class TeracPreconditionError extends Error {
  constructor(message = "Terac launch precondition failed (412)") {
    super(message);
    this.name = "TeracPreconditionError";
  }
}

/** Cost per participant the Terac mocks quote / price opportunities at. */
export const terac = { cpi: 3 };

export const PAGE_TEXT =
  "Ledgerly turns your Etsy sales into tax-ready books. Connect your shop in 2 minutes. Export a tax-ready report in one click. Plans from $12 per month. Trusted by HubSpot partners.";

export const m = {
  // whop (B)
  refundPayment: vi.fn(),
  listRecentPayments: vi.fn(),
  submitDisputeEvidence: vi.fn(),
  setAdCampaignBudget: vi.fn(),
  createCheckout: vi.fn(),
  // terac (C)
  getTeracContext: vi.fn(),
  requestQuote: vi.fn(),
  getQuote: vi.fn(),
  createOpportunity: vi.fn(),
  launchOpportunity: vi.fn(),
  getOpportunity: vi.fn(),
  listSubmissions: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  stopOpportunity: vi.fn(),
  // llm / agents (D)
  gradeJurorResponse: vi.fn(),
  fireAgent: vi.fn(),
  // email (F)
  sendEmail: vi.fn(),
  // exa (lead)
  getPageText: vi.fn(),
  searchMarket: vi.fn(),
};

export function resetMocks() {
  seq = 0;
  terac.cpi = 3;
  for (const f of Object.values(m)) f.mockReset();
  m.refundPayment.mockImplementation(async () => ({ refundId: next("rf"), status: "succeeded" }));
  m.listRecentPayments.mockResolvedValue([]);
  m.submitDisputeEvidence.mockResolvedValue(undefined);
  m.setAdCampaignBudget.mockResolvedValue(undefined);
  m.createCheckout.mockImplementation(async () => ({ checkoutId: next("ch"), purchaseUrl: "https://whop.test/checkout" }));
  m.getTeracContext.mockResolvedValue({ balanceDollars: 500 });
  m.requestQuote.mockImplementation(async () => ({ id: next("feas"), status: "RECEIVED" }));
  m.getQuote.mockImplementation(async (id: string) => ({ id, status: "RESPONDED", costPerParticipant: terac.cpi }));
  m.createOpportunity.mockImplementation(async (i: { numParticipants: number }) => ({
    id: next("opp"),
    totalCostCents: Math.round(i.numParticipants * terac.cpi * 100),
    costPerParticipantCents: Math.round(terac.cpi * 100),
    affordable: true,
  }));
  m.launchOpportunity.mockResolvedValue(undefined);
  m.getOpportunity.mockImplementation(async (id: string) => ({ id, status: "live", submissionStats: {} }));
  m.listSubmissions.mockResolvedValue([]);
  m.approveSubmission.mockResolvedValue(undefined);
  m.rejectSubmission.mockResolvedValue(undefined);
  m.stopOpportunity.mockResolvedValue(undefined);
  m.gradeJurorResponse.mockResolvedValue({
    pass: true, quality_score: 8, reason: "Clear, specific, on-topic answers.", understood_a: true, understood_b: true, flags: [], approve: true, costUsd: 0.0004,
  });
  m.fireAgent.mockImplementation(async () => {
    const id = next("sess");
    return { sessionId: id, sessionUrl: `https://claude.ai/code/${id}` };
  });
  m.sendEmail.mockImplementation(async () => ({ id: next("em") }));
  m.getPageText.mockImplementation(async (url: string) => ({ url, title: "Ledgerly", text: PAGE_TEXT, costDollars: 0.001 }));
  m.searchMarket.mockResolvedValue({ results: [{ url: "https://x.test", title: "x", highlights: ["y"] }], costDollars: 0.005 });
}

export const whopModule = {
  refundPayment: m.refundPayment,
  listRecentPayments: m.listRecentPayments,
  submitDisputeEvidence: m.submitDisputeEvidence,
  setAdCampaignBudget: m.setAdCampaignBudget,
  createCheckout: m.createCheckout,
};
export const teracModule = {
  getTeracContext: m.getTeracContext,
  requestQuote: m.requestQuote,
  getQuote: m.getQuote,
  createOpportunity: m.createOpportunity,
  launchOpportunity: m.launchOpportunity,
  getOpportunity: m.getOpportunity,
  listSubmissions: m.listSubmissions,
  approveSubmission: m.approveSubmission,
  rejectSubmission: m.rejectSubmission,
  stopOpportunity: m.stopOpportunity,
  TeracPreconditionError,
};
export const llmModule = { gradeJurorResponse: m.gradeJurorResponse };
export const agentsModule = { fireAgent: m.fireAgent };
export const emailModule = { sendEmail: m.sendEmail };
export const exaModule = { getPageText: m.getPageText, searchMarket: m.searchMarket };
