// What a TierCta click does, as a plain async function (unit-tested with a mocked fetch).
// TierCta.tsx only renders the outcome.
import type { AddonName } from "@/lib/constants";
import type { Attribution, TrackEvent, TrackEvents } from "@/lib/attribution";
import { postJson } from "./client-api";
import {
  buildCheckoutBody,
  checkoutOutcome,
  decideTierAction,
  type CheckoutInput,
  type CheckoutOutcome,
  type CtaTier,
} from "./logic";

export type TierClickContext = {
  refused: boolean;
  salesPaused: boolean;
  checkoutInput: (Omit<CheckoutInput, "email"> & { email: string | null }) | null;
  /** id of a non-refused preview, if any */
  previewId: string | null;
  addons: AddonName[];
  parentOrderId: string | null;
  /** code typed into "Have a code?"; falls back to the attributed ?code= */
  code: string | null;
};

export type TierClickDeps = {
  post: typeof postJson;
  assign: (url: string) => void;
  attribution: () => Attribution;
  track: <E extends TrackEvent>(event: E, props?: TrackEvents[E]) => void;
};

export type TierClickResult =
  | { kind: "hidden" | "waitlist" | "open_form" | "need_email" }
  | { kind: "redirecting"; url: string }
  | Exclude<CheckoutOutcome, { kind: "redirect" }>;

export async function performTierClick(tier: CtaTier, c: TierClickContext, deps: TierClickDeps): Promise<TierClickResult> {
  const action = decideTierAction({ tier, refused: c.refused, salesPaused: c.salesPaused, input: c.checkoutInput });
  deps.track("tier_clicked", { tier, has_preview: Boolean(c.previewId) });
  if (action.kind !== "checkout" && action.kind !== "quote") return { kind: action.kind };
  const input = c.checkoutInput;
  if (!input?.email) return { kind: "need_email" };
  const attr = deps.attribution();
  const src = attr.src ?? null;

  if (action.kind === "quote" || tier === "specialist") {
    const res = await deps.post("/api/quote", {
      email: input.email,
      buyer_desc: input.buyer_desc,
      ...(input.url ? { url: input.url } : { pitch_text: input.pitch_text }),
      ...(c.previewId ? { preview_id: c.previewId } : {}),
      ...(src ? { src } : {}),
    });
    const out = checkoutOutcome(res.status, res.body);
    return out.kind === "redirect" ? { kind: "error", message: "Unexpected answer from the quote service. Please try again." } : out;
  }

  const code = c.code ?? attr.code ?? null;
  const body = buildCheckoutBody({
    tier,
    addons: c.addons,
    input: { ...input, email: input.email },
    previewId: c.previewId,
    parentOrderId: c.parentOrderId,
    code,
    src,
  });
  const res = await deps.post("/api/checkout", body, 35_000);
  const out = checkoutOutcome(res.status, res.body);
  if (out.kind === "redirect") {
    deps.track("checkout_redirected", { tier, code });
    deps.assign(out.url);
    return { kind: "redirecting", url: out.url };
  }
  return out;
}
