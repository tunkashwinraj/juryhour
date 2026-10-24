// Zod input schemas for every Ops API action (CONTRACTS §5, SPEC §12).
import { z } from "zod";
import { REFUND_POLICIES } from "@/lib/guardrails";
import { REJECT_CATEGORIES } from "@/lib/orders/panel";
import { Actor, Card, JurorProfile, Questions, Report } from "@/lib/types";

/** Agents may act as any role except "code" (reserved for the backend's own log lines). */
export const OpsActor = Actor.exclude(["code"]);

/** CONTRACTS §3 F template names (kept here so the Ops API doesn't depend on email internals). */
export const EMAIL_TEMPLATE_NAMES = [
  "paid", "delivered", "partial", "refunded", "preview_followup_1", "preview_followup_2", "quote_ready", "support_reply",
] as const;
export const MARKETING_TEMPLATE_NAMES = new Set(["preview_followup_1", "preview_followup_2"]);
export const TRANSACTIONAL_TEMPLATE_NAMES = new Set(["paid", "delivered", "partial", "refunded", "quote_ready"]);

const uuid = z.string().uuid();
const httpUrl = z.string().max(2000).url().refine((u) => /^https?:\/\//i.test(u), "must be http(s)");

export const ACTION_SCHEMAS = {
  get_order: z.object({ order_id: uuid }),
  exa_search: z.object({ order_id: uuid, query: z.string().trim().min(2).max(300) }),
  exa_contents: z.object({ order_id: uuid, url: httpUrl }),
  submit_test: z.object({
    order_id: uuid,
    card_a: Card,
    card_b: Card.nullable().optional(),
    juror_profile: JurorProfile,
    questions: Questions,
    research_notes: z.string().max(10_000).default(""),
    rewrite_strategy: z.string().max(4_000).default(""),
  }),
  request_quote: z.object({ order_id: uuid }),
  launch_panel: z.object({ order_id: uuid, n: z.number().int().positive().optional() }),
  broaden_audience: z.object({ order_id: uuid, new_panel_description: z.string().trim().min(10).max(400) }),
  decide_submission: z.object({
    response_id: uuid,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().max(1000).optional(),
    category: z.enum(REJECT_CATEGORIES).optional(),
  }),
  submit_report: z.object({ order_id: uuid, report: Report }),
  refund: z.object({ order_id: uuid, amount: z.number().positive(), policy: z.enum(REFUND_POLICIES) }),
  pause_sales: z.object({ reason: z.string().trim().min(3).max(500) }),
  resume_sales: z.object({ reason: z.string().trim().min(3).max(500) }),
  change_price: z.object({ tier: z.string().min(1).max(40), price: z.number().positive() }),
  set_ads_budget: z.object({ campaign_id: z.string().min(1).max(200).optional(), daily_usd: z.number().min(0) }),
  send_email: z.object({
    to: z.string().trim().email().max(320),
    template: z.enum(EMAIL_TEMPLATE_NAMES),
    order_id: uuid.optional(),
    vars: z
      .record(z.string().max(64), z.union([z.string().max(8000), z.number(), z.null()]))
      .refine((v) => Object.keys(v).length <= 20, "at most 20 vars")
      .default({}),
  }),
  log_decision: z.object({
    order_id: uuid.optional(),
    action: z.string().trim().min(2).max(100),
    reasoning: z.string().min(1).max(8000),
    payload: z.unknown().optional(),
  }),
  metrics: z.object({}),
  dispute_evidence: z.object({ dispute_id: z.string().min(1).max(200), order_id: uuid }),
} as const;

export type OpsAction = keyof typeof ACTION_SCHEMAS;
export const OPS_ACTIONS = Object.keys(ACTION_SCHEMAS) as OpsAction[];
export type OpsInput<A extends OpsAction> = z.infer<(typeof ACTION_SCHEMAS)[A]>;
