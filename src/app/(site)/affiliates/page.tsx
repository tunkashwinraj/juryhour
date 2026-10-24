import Link from "next/link";
import { Banner, Button, Section } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { faqByIds } from "../../../../content/faq";
import { FaqBlock, PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "Affiliate program: earn 30% through Whop",
  description:
    "Refer founders, Whop sellers and clients to JuryHour and earn 30% of each referred purchase through Whop's affiliate program.",
  path: "/affiliates",
  ogTitle: "Earn 30% referring JuryHour",
});

/**
 * TODO(founder): set the JuryHour affiliate link from the Whop dashboard (Affiliates → your link
 * format). While this is null the page shows "join link coming soon" and no button.
 */
const WHOP_AFFILIATE_URL: string | null = null;

const WHOP_AFFILIATE_DOCS = "https://docs.whop.com/manage-your-business/growth-marketing/affiliate-program";
const WHOP_AFFILIATE_GUIDE = "https://docs.whop.com/affiliates/be-an-affiliate";

export default function AffiliatesPage() {
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "Affiliates", path: "/affiliates" }]}
        eyebrow="AFFILIATE PROGRAM"
        title="How do I earn money referring JuryHour?"
        lede="Join our affiliate program on Whop and earn 30% of every purchase made through your link. Whop tracks referrals and pays you; we never handle the money."
      >
        {WHOP_AFFILIATE_URL ? (
          <Button href={WHOP_AFFILIATE_URL} variant="primary" size="lg">
            Join on Whop
          </Button>
        ) : null}
      </PageHero>

      {WHOP_AFFILIATE_URL ? null : (
        <Section>
          <Banner tone="info">
            The join link is coming soon. Until then, <Link href="/contact">contact us</Link> and we&apos;ll send it when
            it&apos;s live.
          </Banner>
        </Section>
      )}

      <Section id="how" title="How does the affiliate program work?">
        <p className={kit.answer}>
          You get a personal Whop link. When someone buys JuryHour through it, Whop credits you 30% of that purchase and
          pays it out after Whop&apos;s 30-day waiting period.
        </p>
        <ol className={kit.steps}>
          <li>
            <strong>Join on Whop</strong> to get your affiliate link.
          </li>
          <li>
            <strong>Share it</strong> wherever your audience is: a newsletter, a community, a client proposal.
          </li>
          <li>
            <strong>Get paid by Whop.</strong> Whop says there&apos;s a 30-day waiting period between a referred purchase and
            your commission<sup className={kit.fn}><a href="#src-1">1</a></sup>. If a referred payment is refunded or
            disputed, Whop returns that commission to us<sup className={kit.fn}><a href="#src-2">2</a></sup>.
          </li>
        </ol>
      </Section>

      <Section id="who" title="Who is the program for?">
        <p className={kit.answer}>
          People whose audience launches landing pages: agencies and freelancers, Whop creators who teach selling, and
          builders who write about Lovable, Bolt, Replit, Cursor or v0.
        </p>
        <p className={kit.prose}>
          Agencies can also run tests on client pages directly; see <Link href="/for/agencies">JuryHour for agencies</Link>.
        </p>
      </Section>

      <Section id="rules" title="What are the rules for promoting JuryHour?">
        <p className={kit.answer}>
          Be honest about what it is: a directional signal from real people, not a sales guarantee.
        </p>
        <ul className={kit.prose}>
          <li>Don&apos;t promise results, conversion lifts or discounts. Codes don&apos;t change the price.</li>
          <li>Don&apos;t invent testimonials or numbers. Our own example report is labeled as an example; keep it that way.</li>
          <li>Don&apos;t bid on &quot;JuryHour&quot; as an ad keyword or impersonate us.</li>
          <li>
            Use the free preview as your hook: anyone can try it without paying. Link to{" "}
            <Link href="/sample-report">the sample report</Link> and <Link href="/how-it-works">how it works</Link>.
          </li>
        </ul>
      </Section>

      <Section id="sources">
        <div className={kit.notes}>
          <p style={{ margin: 0 }}>Sources (Whop documentation, checked Oct 24, 2026):</p>
          <ol>
            <li id="src-1">
              Whop affiliate program: <a href={WHOP_AFFILIATE_DOCS} rel="noopener noreferrer" target="_blank">{WHOP_AFFILIATE_DOCS}</a>
            </li>
            <li id="src-2">
              Be an affiliate: <a href={WHOP_AFFILIATE_GUIDE} rel="noopener noreferrer" target="_blank">{WHOP_AFFILIATE_GUIDE}</a>
            </li>
          </ol>
        </div>
      </Section>

      <FaqBlock title="Questions about the affiliate program" items={faqByIds(["affiliate", "codes", "client-pages"])} />
    </main>
  );
}
