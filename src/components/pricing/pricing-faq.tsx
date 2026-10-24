// Pricing FAQ for /pricing (FAQPage JSON-LD uses aText). Matches the code rules: launch price is
// applied by time at checkout, promo codes are attribution only, add-ons are +5 jurors and Rush.
import Link from "next/link";
import { ADDONS, ADDON_EXTRA_JURORS, UPGRADE_CREDIT_HOURS } from "@/lib/constants";
import type { FaqItem } from "@/components/marketing/home-content";

export const PRICING_FAQ: FaqItem[] = [
  {
    q: "Is there a subscription?",
    aText: "No. You pay per test, once, at checkout. Nothing renews.",
    a: <p>No. You pay per test, once, at checkout. Nothing renews.</p>,
  },
  {
    q: "Which package should I start with?",
    aText:
      "Start with the free AI preview. If you want to know whether real people get your headline, Spark is the cheapest check. If you want to know whether a rewrite beats your page, Proof is the one we recommend: real people judge your page against ours, blind, and you get the winning copy.",
    a: (
      <p>
        Start with the free AI preview. If you want to know whether real people get your headline, Spark is the
        cheapest check. If you want to know whether a rewrite beats your page, Proof is the one we recommend: real
        people judge your page against ours, blind, and you get the winning copy.
      </p>
    ),
  },
  {
    q: "How does the launch price work?",
    aText:
      "When a launch price is running, it's shown on this page with its end time and applied automatically at checkout. You don't need a code. When the time is up, the normal price applies.",
    a: (
      <p>
        When a launch price is running, it&rsquo;s shown on this page with its end time and applied automatically at
        checkout. You don&rsquo;t need a code. When the time is up, the normal price applies.
      </p>
    ),
  },
  {
    q: "Do promo codes give a discount?",
    aText:
      "No. Codes from partners and communities only tell us where you heard about us. The price is the same with or without one.",
    a: (
      <p>
        No. Codes from partners and communities only tell us where you heard about us. The price is the same with or
        without one.
      </p>
    ),
  },
  {
    q: "What are the add-ons?",
    aText: `+${ADDON_EXTRA_JURORS} jurors ($${ADDONS.extra5}) puts more people on your panel. Rush ($${ADDONS.rush}) puts your panel first in line. Both are chosen at checkout.`,
    a: (
      <p>
        +{ADDON_EXTRA_JURORS} jurors (${ADDONS.extra5}) puts more people on your panel. Rush (${ADDONS.rush}) puts your
        panel first in line. Both are chosen at checkout.
      </p>
    ),
  },
  {
    q: "Can I upgrade from Spark?",
    aText: `Yes. Your Spark counts toward Proof (or Pulse, or Launch Pack) if you upgrade within ${UPGRADE_CREDIT_HOURS} hours, using the link in your Spark report.`,
    a: (
      <p>
        Yes. Your Spark counts toward Proof (or Pulse, or Launch Pack) if you upgrade within {UPGRADE_CREDIT_HOURS}{" "}
        hours, using the link in your Spark report.
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
