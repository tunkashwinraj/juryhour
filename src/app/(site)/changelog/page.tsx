import { Section } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { CHANGELOG } from "../../../../content/changelog";
import { PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "Changelog: what's new at JuryHour",
  description: "Dated updates to JuryHour, newest first: product changes, new pages and fixes.",
  path: "/changelog",
  ogTitle: "JuryHour changelog",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-24" → "Oct 24, 2026" (no Date: keeps the page deterministic for prerendering). */
const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

export default function ChangelogPage() {
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "Changelog", path: "/changelog" }]}
        eyebrow="CHANGELOG"
        title="What's changed at JuryHour?"
        lede="Dated updates, newest first. Everything here shipped; nothing is a roadmap."
      />
      <Section>
        {CHANGELOG.map((e, i) => (
          <article key={`${e.date}-${i}`} className={kit.entry}>
            <time dateTime={e.date} className={`${kit.mono} ${kit.muted}`}>
              {fmt(e.date)}
            </time>
            <div>
              <h2>{e.title}</h2>
              <ul>
                {e.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </Section>
    </main>
  );
}
