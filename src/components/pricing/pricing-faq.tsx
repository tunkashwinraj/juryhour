// Pricing FAQ for /pricing (FAQPage JSON-LD uses aText). Matches the code rules: two plans, extra
// jurors at $7, the HALF coupon (first Verdict, combines with the Quick Read credit), partner codes are
// attribution only. Dates come from the default HALF config (update with COUPON_HALF_ENDS_AT).
import Link from "next/link";
import {
  EXTRA_JUROR_USD,
  MAX_EXTRA_JURORS,
  TIERS,
  UPGRADE_CREDIT_HOURS,
  VERDICT_REGULAR_FROM,
  VERDICT_REGULAR_USD,
} from "@/lib/constants";
import { HALF_DEFAULT, couponPrice } from "@/lib/coupons";
import { couponEndsLabel } from "@/components/pricing/pricing-data";
import type { FaqItem } from "@/components/marketing/home-content";

const QR = TIERS.spark.price;
const VERDICT = TIERS.proof.price;
const C = HALF_DEFAULT;
const C_PRICE = couponPrice(VERDICT, C.percentOff);
const C_ENDS = couponEndsLabel(C.endsAt);

export const PRICING_FAQ: FaqItem[] = [
  {
    q: "Is there a subscription?",
    aText: "No. You pay per test, once, at checkout. Nothing renews.",
    a: <p>No. You pay per test, once, at checkout. Nothing renews.</p>,
  },
  {
    q: "Which package should I start with?",
    aText:
      "Start with the free AI preview. If you want to know whether real people get your headline, Quick Read is the cheapest check. If you want to know whether a rewrite beats your page, Verdict is the one we recommend: real people judge your page against ours, blind, and you get the winning copy.",
    a: (
      <p>
        Start with the free AI preview. If you want to know whether real people get your headline, Quick Read is the
        cheapest check. If you want to know whether a rewrite beats your page, Verdict is the one we recommend: real
        people judge your page against ours, blind, and you get the winning copy.
      </p>
    ),
  },
  {
    q: "Why is the Verdict $" + VERDICT + "?",
    aText: `$${VERDICT} is our launch offer for the Verdict. The regular price will be $${VERDICT_REGULAR_USD} from ${VERDICT_REGULAR_FROM}. The price you see at checkout is the price you pay.`,
    a: (
      <p>
        ${VERDICT} is our launch offer for the Verdict. The regular price will be ${VERDICT_REGULAR_USD} from{" "}
        {VERDICT_REGULAR_FROM}. The price you see at checkout is the price you pay.
      </p>
    ),
  },
  {
    q: `How does the ${C.code} code work?`,
    aText: `${C.code} takes your first Verdict from $${VERDICT} to $${C_PRICE}, through ${C_ENDS}. It's one per customer (the first Verdict for your email), it applies to the Verdict price only (not extra jurors), and it works with the Quick Read upgrade credit ($${C_PRICE} − $${QR} = $${C_PRICE - QR}). Arrive with a link that carries the code or type it in "Have a code?"; checkout shows the price before you pay.`,
    a: (
      <p>
        {C.code} takes your first Verdict from ${VERDICT} to ${C_PRICE}, through {C_ENDS}. It&rsquo;s one per customer
        (the first Verdict for your email), it applies to the Verdict price only (not extra jurors), and it works with
        the Quick Read upgrade credit (${C_PRICE} − ${QR} = ${C_PRICE - QR}). Arrive with a link that carries the code
        or type it in &ldquo;Have a code?&rdquo;; checkout shows the price before you pay.
      </p>
    ),
  },
  {
    q: "Do partner codes give a discount?",
    aText: `No. Codes from partners and communities only tell us where you heard about us. The only discount code is ${C.code}, above.`,
    a: (
      <p>
        No. Codes from partners and communities only tell us where you heard about us. The only discount code is{" "}
        {C.code}, above.
      </p>
    ),
  },
  {
    q: "Can I add more jurors?",
    aText: `Yes. Add up to ${MAX_EXTRA_JURORS} extra jurors to a Quick Read or Verdict at $${EXTRA_JUROR_USD} each, in the checkout step. Codes and credits never change the price of extra jurors.`,
    a: (
      <p>
        Yes. Add up to {MAX_EXTRA_JURORS} extra jurors to a Quick Read or Verdict at ${EXTRA_JUROR_USD} each, in the
        checkout step. Codes and credits never change the price of extra jurors.
      </p>
    ),
  },
  {
    q: "Can I upgrade from a Quick Read?",
    aText: `Yes. Your $${QR} counts toward a Verdict for ${UPGRADE_CREDIT_HOURS} hours: upgrade from the link in your Quick Read report and you pay $${VERDICT - QR} instead of $${VERDICT} (or $${C_PRICE - QR} with ${C.code} on your first Verdict).`,
    a: (
      <p>
        Yes. Your ${QR} counts toward a Verdict for {UPGRADE_CREDIT_HOURS} hours: upgrade from the link in your Quick
        Read report and you pay ${VERDICT - QR} instead of ${VERDICT} (or ${C_PRICE - QR} with {C.code} on your first
        Verdict).
      </p>
    ),
  },
  {
    q: "How do I pay?",
    aText: "Checkout is handled by Whop. We never see your card details.",
    a: <p>Checkout is handled by Whop. We never see your card details.</p>,
  },
  {
    q: "What if something goes wrong?",
    aText:
      "If we can't recruit your audience or deliver the minimum panel, you get a full refund automatically; if we deliver short, a pro-rata refund. Late or failed delivery is refunded through support. See the refund policy at /legal/refunds.",
    a: (
      <p>
        If we can&rsquo;t recruit your audience or deliver the minimum panel, you get a full refund automatically; if
        we deliver short, a pro-rata refund. Late or failed delivery is refunded through support. See the{" "}
        <Link href="/legal/refunds">refund policy</Link>.
      </p>
    ),
  },
];
