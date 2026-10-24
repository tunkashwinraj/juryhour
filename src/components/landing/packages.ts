// What each package includes (SPEC §1). Juror counts and minutes come from constants.
import { ADDONS, ADDON_EXTRA_JURORS, TIERS, type AddonName } from "@/lib/constants";

export type BuyableTier = "spark" | "pulse" | "proof" | "launch_pack";

export const PACKAGES: {
  tier: BuyableTier;
  name: string;
  summary: string;
  includes: string[];
  featured?: boolean;
}[] = [
  {
    tier: "spark",
    name: "Spark",
    summary: `${TIERS.spark.jurors} jurors, ${TIERS.spark.minutes} minutes each`,
    includes: [
      `${TIERS.spark.jurors} real people react to your headline`,
      "AI critique of your page",
      "1 rewritten headline (not tested on people)",
    ],
  },
  {
    tier: "pulse",
    name: "Pulse",
    summary: `${TIERS.pulse.jurors} jurors, ${TIERS.pulse.minutes} minutes each`,
    includes: [
      `${TIERS.pulse.jurors} real people react to your current page`,
      "Full report with anonymous juror quotes",
      "A rewrite of your page (not tested on people)",
    ],
  },
  {
    tier: "proof",
    name: "Proof",
    summary: `${TIERS.proof.jurors} jurors, ${TIERS.proof.minutes}-minute A/B test`,
    featured: true,
    includes: [
      "Our agent rewrites your pitch as a challenger",
      `${TIERS.proof.jurors} real people judge yours against it, in random order`,
      "Verdict, scorecard and the winning copy, ready to paste",
    ],
  },
  {
    tier: "launch_pack",
    name: "Launch Pack",
    summary: `${TIERS.launch_pack.jurors} jurors now, plus a retest`,
    includes: [
      "Everything in Proof, today",
      "One free retest after you update your page",
    ],
  },
];

export const ADDON_OPTIONS: { key: AddonName; label: string; price: number }[] = [
  { key: "extra5", label: `${ADDON_EXTRA_JURORS} more jurors`, price: ADDONS.extra5 },
  { key: "rush", label: "Rush: your panel goes first", price: ADDONS.rush },
];

export function addonsTotal(selected: AddonName[]): number {
  return selected.reduce((s, a) => s + ADDONS[a], 0);
}
