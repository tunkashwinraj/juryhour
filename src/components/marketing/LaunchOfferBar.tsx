// Launch-offer bar (docs/WEBSITE_SPEC.md §5.1, WEBSITE_CONTRACTS §0.1). Server component: reads the
// cached pricing snapshot, renders nothing without an active offer. The client guard hides it the
// moment `endsAt` passes, even if the static shell is a few minutes old. No promo code is shown:
// checkout applies the launch price by time, and codes never give a discount.
import Link from "next/link";
import { getPricingSnapshot } from "@/lib/marketing-data";
import { TIER_LABEL, offerEndsLabel, usd } from "@/components/pricing/pricing-data";
import { ExpiryGuard } from "./ExpiryGuard";
import { OfferCountdown } from "./OfferCountdown";
import s from "./marketing.module.css";

export async function LaunchOfferBar() {
  let snap;
  try {
    snap = await getPricingSnapshot();
  } catch {
    return null;
  }
  const { offer, asOf } = snap;
  if (!offer) return null;

  return (
    <ExpiryGuard endsAt={offer.endsAt}>
      <aside className={s.offerBar} aria-label="Launch offer">
        <p className={s.offerBarInner} style={{ margin: 0 }}>
          <span>
            Launch price:{" "}
            <strong>
              {TIER_LABEL[offer.tier]} <span className={s.mono}>{usd(offer.priceUsd)}</span>
            </strong>{" "}
            (normally <span className={s.mono}>{usd(offer.normalUsd)}</span>) {offerEndsLabel(offer.endsAt, new Date(asOf))}.
          </span>
          <OfferCountdown endsAt={offer.endsAt} className={s.mono} />
          <Link href="/pricing">See pricing</Link>
        </p>
      </aside>
    </ExpiryGuard>
  );
}
