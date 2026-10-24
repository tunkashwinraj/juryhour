// Row shapes for the tables Workstream E reads and writes (mirror of supabase/migrations/0001_init.sql).
// numeric columns arrive from PostgREST as numbers (or strings for very large values): always Number() them.
import type { Answers, Card, JurorProfile, Mode, Questions, Report, Stage } from "@/lib/types";
import type { AddonName, TierName } from "@/lib/constants";

export type OrderRow = {
  id: string;
  token: string;
  mode: Mode;
  stage: Stage;
  tier: TierName;
  addons: AddonName[];
  /** Paid extra jurors, 0–15 (migration 0006; absent on older rows). */
  extra_jurors?: number | null;
  price_usd: number | null;
  email: string;
  url: string | null;
  pitch_text: string | null;
  buyer_desc: string;
  src: string | null;
  preview_id: string | null;
  parent_order_id: string | null;
  whop_checkout_id: string | null;
  whop_payment_id: string | null;
  whop_receipt_url: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  deadline_at: string | null;
  quote_expires_at: string | null;
  stage_entered_at: string;
  attempts: number;
  refund_usd: number;
  support_refund_used: boolean;
  retest_available: boolean;
  report: Report | null;
  report_public: boolean;
  human_interventions: number;
  created_at: string;
  updated_at: string;
};

export type TestRow = {
  id: string;
  order_id: string;
  card_a: Card;
  card_b: Card | null;
  format: "spark" | "pulse" | "proof" | "specialist";
  juror_profile: JurorProfile;
  questions: Questions;
  research_notes: string | null;
  rewrite_strategy: string | null;
  created_at: string;
};

export type PanelStatus = "quoting" | "priced" | "live" | "stopped" | "infeasible";

export type PanelRow = {
  id: string;
  order_id: string;
  test_id: string;
  mode: Mode;
  terac_feasibility_id: string | null;
  terac_opportunity_id: string | null;
  requested_n: number;
  approved_n: number;
  rejected_n: number;
  cost_per_participant: number | null;
  budget_usd: number | null;
  status: PanelStatus;
  audience_broadened: boolean;
  launched_at: string | null;
  stopped_at: string | null;
  created_at: string;
};

export type Decision = "approved" | "rejected" | "pending";

export type ResponseRow = {
  id: string;
  test_id: string;
  panel_id: string;
  terac_submission_id: string;
  first_card: "A" | "B";
  answers: Answers;
  seconds_spent: number;
  attention_passed: boolean;
  quality_score: number | null;
  quality_reason: string | null;
  understood_a: boolean | null;
  understood_b: boolean | null;
  grader_flags: string[] | null;
  decision: Decision | null;
  decided_at: string | null;
  created_at: string;
};

export type ApprovedResponseRow = ResponseRow & { juror_number: number };

export type AgentRunRow = {
  id: string;
  order_id: string | null;
  agent: string;
  session_id: string | null;
  session_url: string | null;
  status: "fired" | "completed" | "failed" | "timed_out";
  attempt: number;
  started_at: string;
  ended_at: string | null;
};

export type CompanyStateRow = {
  id: 1;
  sales_paused: boolean;
  pause_reason: string | null;
  terac_balance_usd: number | null;
  terac_balance_checked_at: string | null;
  human_interventions: number;
  updated_at: string;
};

export type PriceRow = {
  tier: string;
  base_usd: number;
  current_usd: number;
  min_usd: number;
  max_usd: number;
  last_changed_at: string | null;
};

export type PreviewRow = {
  id: string;
  email: string | null;
  url: string | null;
  pitch_text: string | null;
  buyer_desc: string | null;
  page_text: string | null;
  headline: string | null;
  weakest_line: string | null;
  safety_verdict: "allow" | "refuse";
  src: string | null;
  followup_1_sent_at: string | null;
  followup_2_sent_at: string | null;
  created_at: string;
};

export type LedgerKind =
  | "revenue" | "refund" | "terac_cost" | "ai_cost" | "exa_cost" | "whop_fee" | "affiliate" | "ads";

export type RefundPolicy = "infeasible" | "short_panel" | "failed" | "support";
