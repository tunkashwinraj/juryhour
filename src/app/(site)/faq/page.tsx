import { FAQ, Section } from "@/components/ui";
import { JsonLd, faqLd, pageMetadata } from "@/lib/seo";
import { ALL_FAQ, FAQ_GROUPS } from "../../../../content/faq";
import { PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "FAQ: jurors, privacy, pricing and refunds",
  description:
    "Answers about JuryHour: who the jurors are, how they're verified, what they see, privacy, pricing, refunds, agencies and the agent API.",
  path: "/faq",
  ogTitle: "JuryHour FAQ",
});

const GROUP_TITLES: Record<string, string> = {
  product: "What do I get from JuryHour?",
  jurors: "Who judges my page?",
  privacy: "What happens to my page and data?",
  pricing: "How do pricing and refunds work?",
  agencies: "How does JuryHour work for agencies?",
  agents: "Can AI agents and developers use JuryHour?",
};

export default function FaqPage() {
  return (
    <main id="main">
      <JsonLd data={faqLd(ALL_FAQ.map((i) => ({ q: i.q, aText: i.aText })))} />
      <PageHero
        crumbs={[{ name: "FAQ", path: "/faq" }]}
        eyebrow="FAQ"
        title="Frequently asked questions"
        lede="Short answers first. Can't find yours? Email us from the contact page; we aim to reply the same day."
      >
        <nav aria-label="FAQ sections" className={kit.crumbs}>
          <ol>
            {FAQ_GROUPS.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`}>{g.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      </PageHero>
      {FAQ_GROUPS.map((g) => (
        <Section key={g.id} id={g.id} eyebrow={g.title.toUpperCase()} title={GROUP_TITLES[g.id] ?? g.title}>
          <FAQ items={g.items} headingLevel={3} />
        </Section>
      ))}
    </main>
  );
}
