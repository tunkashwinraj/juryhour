// Live counters (WEBSITE_CONTRACTS §0.7): DB only, live mode only, each counter rendered only when
// its value is ≥ 1; with nothing to show the whole block is omitted. Never seeded.
import { getLiveCounters, type LiveCounters as Counters } from "@/lib/marketing-data";
import { formatDuration } from "@/components/pricing/pricing-data";
import s from "./marketing.module.css";

export type CounterItem = { key: keyof Counters; value: string; label: string };

/** Pure: which counters may be shown. Average delivery time needs at least one delivered verdict. */
export function visibleCounters(c: Counters): CounterItem[] {
  const out: CounterItem[] = [];
  if (c.verdictsDelivered >= 1) {
    out.push({
      key: "verdictsDelivered",
      value: c.verdictsDelivered.toLocaleString("en-US"),
      label: c.verdictsDelivered === 1 ? "verdict delivered" : "verdicts delivered",
    });
  }
  if (c.peopleHeard >= 1) {
    out.push({
      key: "peopleHeard",
      value: c.peopleHeard.toLocaleString("en-US"),
      label: c.peopleHeard === 1 ? "real person heard" : "real people heard",
    });
  }
  if (c.verdictsDelivered >= 1 && c.avgDeliveryMinutes !== null && c.avgDeliveryMinutes >= 1) {
    out.push({ key: "avgDeliveryMinutes", value: formatDuration(c.avgDeliveryMinutes), label: "average delivery time" });
  }
  return out;
}

export async function LiveCounters() {
  const items = visibleCounters(await getLiveCounters());
  if (items.length === 0) return null;
  return (
    <dl className={s.counters} aria-label="Live counts from our database">
      {items.map((i) => (
        <div key={i.key} className={s.counter}>
          <dt className={s.counterLabel}>{i.label}</dt>
          <dd className={s.counterValue}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
