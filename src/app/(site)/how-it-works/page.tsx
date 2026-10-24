import Link from "next/link";
import { Button, Section, TimerBar } from "@/components/ui";
import {
  CARD_REVEAL_SECONDS,
  GRADER_PASS_SCORE,
  JUROR_MIN_SECONDS,
  JUROR_MIN_WORDS,
  MARGIN_FLOOR,
  MAX_REJECT_RATE,
  TIERS,
} from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";
import { faqByIds } from "../../../../content/faq";
import { FaqBlock, PageHero, kit } from "../for/_kit";
import { FlowDiagram } from "./FlowDiagram";

export const metadata = pageMetadata({
  title: "How JuryHour tests landing pages on real people",
  description:
    "The full method: Terac recruiting, 5-second blind cards in random order, attention checks, AI grading, SQL statistics and verbatim-checked quotes.",
  path: "/how-it-works",
  ogTitle: "How it works: real people, 5 seconds, a verdict",
});

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function HowItWorksPage() {
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "How it works", path: "/how-it-works" }]}
        eyebrow="THE METHOD"
        title="How do you test a landing page with real people?"
        lede={`You show real people who match your buyer your page for ${CARD_REVEAL_SECONDS} seconds and ask what it does. JuryHour does that for you: an agent writes a challenger, Terac recruits the jury, code checks every answer, and the verdict comes from the database, not from a model's opinion.`}
      >
        <Button href="/#preview" variant="primary">
          Get a free preview
        </Button>
        <Button href="/sample-report" variant="link">
          See a sample report
        </Button>
      </PageHero>

      <Section id="flow" title="What happens after I pay?">
        <p className={kit.answer}>
          Eight steps, most of them automatic. Agents do the judgment work (writing, reporting); code does everything
          that involves money, limits or numbers.
        </p>
        <FlowDiagram />
        <ol className={kit.steps}>
          <li>
            <strong>You pay through Whop.</strong> Your order gets a private status page you can watch.
          </li>
          <li>
            <strong>An agent researches and writes.</strong> It reads your page, looks up how your market talks, and
            writes two short cards: <em>A</em>, your message as faithfully as possible, and <em>B</em>, a challenger
            that uses only facts already on your page (Proof, Launch Pack and Specialist). It also writes a one-line
            description of your buyer and a screening question.
          </li>
          <li>
            <strong>Terac recruits the jury.</strong> Terac is a research participant platform. Only people who pass the
            screening question can take your test, and Terac verifies their identity and pays them. Code checks that
            the panel fits the price before launching it.
          </li>
          <li>
            <strong>Real people judge.</strong> Each juror sees a card for {CARD_REVEAL_SECONDS} seconds, answers
            questions, then sees the other card. Which card comes first is random per juror, and nobody is told which is
            yours.
          </li>
          <li>
            <strong>Every answer is checked.</strong> Code rules first, then an AI grade. Work that fails is rejected with
            a written reason and not paid.
          </li>
          <li>
            <strong>The database counts.</strong> Scores and preferences are computed in SQL from approved answers only.
          </li>
          <li>
            <strong>An agent writes the report.</strong> Before it can be delivered, code checks every quote against the
            stored answers word for word and every number against the database.
          </li>
          <li>
            <strong>You get the verdict.</strong> Which version won and by how much, the top fixes with jurors&apos; own
            words, and the winning copy ready to paste.
          </li>
        </ol>
      </Section>

      <Section id="what-jurors-see" title="What do jurors see?">
        <p className={kit.answer}>
          A short text card: headline, subheadline, three key points and a call to action, shown for{" "}
          {CARD_REVEAL_SECONDS} seconds and then hidden. That&apos;s about how long a stranger gives your page before
          deciding whether to keep reading.
        </p>
        <TimerBar seconds={CARD_REVEAL_SECONDS} label={`A card is visible for ${CARD_REVEAL_SECONDS} seconds`} />
        <div className={kit.prose} style={{ marginTop: 16 }}>
          <p>
            In Proof, Launch Pack and Specialist, each juror sees both cards, one after the other. Which card comes
            first is chosen at random for each juror, so the order doesn&apos;t decide the winner. Spark and Pulse show
            only your card.
          </p>
          <p>
            Jurors aren&apos;t told which card is the original, and they never see your site or who submitted it.
          </p>
        </div>
      </Section>

      <Section id="questions" title="What exactly are jurors asked?">
        <p className={kit.answer}>
          The same questions after every card, then a preference and an attention check. These are the exact words on
          the juror page.
        </p>
        <div className={kit.tableScroll}>
          <table className={kit.table}>
            <caption className={kit.label} style={{ textAlign: "left", captionSide: "top" }}>
              Questions per card
            </caption>
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Answer</th>
                <th scope="col">Used for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>In your own words, what does this product do, and who is it for?</td>
                <td>Free text, at least {JUROR_MIN_WORDS} words</td>
                <td>Understood it? (graded), quotes</td>
              </tr>
              <tr>
                <td>How clear was it?</td>
                <td>1 (not clear at all) to 7 (very clear)</td>
                <td>Clarity score</td>
              </tr>
              <tr>
                <td>How likely would you be to try it?</td>
                <td>1 (not at all likely) to 7 (very likely)</td>
                <td>Would-try score</td>
              </tr>
              <tr>
                <td>Was anything confusing or unclear? (optional)</td>
                <td>Free text</td>
                <td>Fixes, quotes</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={kit.tableScroll} style={{ marginTop: 24 }}>
          <table className={kit.table}>
            <caption className={kit.label} style={{ textAlign: "left", captionSide: "top" }}>
              After both cards (Proof, Launch Pack, Specialist)
            </caption>
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Answer</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Which one interested you more?</td>
                <td>The first description / the second description</td>
              </tr>
              <tr>
                <td>Why?</td>
                <td>Free text</td>
              </tr>
              <tr>
                <td>Which of these was mentioned in the description you just saw?</td>
                <td>Three options: one real point from the card and two made up (attention check, every tier)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={kit.prose} style={{ marginTop: 16 }}>
          <p>Specialist Jury adds:</p>
          <ul>
            <li>Would you buy something like this? (yes / maybe / no) and Why or why not?</li>
            <li>What would stop you from buying it?</li>
            <li>For what it offers, would you expect the price to feel… (low / fair / high) and what would you expect to pay?</li>
            <li>In your own words, describe the problem this is trying to solve.</li>
          </ul>
        </div>
      </Section>

      <Section id="quality" title="How do you know jurors actually tried?">
        <p className={kit.answer}>
          Every answer passes code checks first and an AI quality grade second; only approved answers count or get paid.
          Rejections always carry a written reason.
        </p>
        <ul className={kit.prose}>
          <li>
            <strong>Time on task:</strong> at least {JUROR_MIN_SECONDS} seconds. Faster submissions are rejected.
          </li>
          <li>
            <strong>Attention check:</strong> pick the point that was really on the card out of three.
          </li>
          <li>
            <strong>Minimum effort:</strong> at least {JUROR_MIN_WORDS} words describing what the product does,
            enforced on the page and again on the server.
          </li>
          <li>
            <strong>AI grading:</strong> an OpenAI model reads each answer against the cards, flags answers that are too
            short, off-topic or look pasted from an AI tool, and scores quality from 0 to 10. An answer needs a pass and a
            score of {GRADER_PASS_SCORE} or more. The same check decides whether the juror understood each card.
          </li>
          <li>
            <strong>A brake on rejecting:</strong> if more than {pct(MAX_REJECT_RATE)} of a panel would be rejected,
            code stops rejecting and flags a possible bug on our side instead of blaming the jurors.
          </li>
        </ul>
      </Section>

      <Section id="numbers" title="How are the numbers calculated?">
        <p className={kit.answer}>
          In SQL, from approved answers only, rounded to two decimals. No model writes a number in your report; the
          agent copies them from the database, and code refuses the report if any number differs.
        </p>
        <div className={kit.tableScroll}>
          <table className={kit.table}>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">How it&apos;s computed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Understood what it does</td>
                <td>Share of approved jurors whose own description of the card was judged correct</td>
              </tr>
              <tr>
                <td>Clarity (1–7)</td>
                <td>Average of the &quot;How clear was it?&quot; answers</td>
              </tr>
              <tr>
                <td>Would try it (1–7)</td>
                <td>Average of the &quot;How likely would you be to try it?&quot; answers</td>
              </tr>
              <tr>
                <td>Preferred it</td>
                <td>Count of jurors who picked each card</td>
              </tr>
              <tr>
                <td>Verdict</td>
                <td>The card more jurors preferred, e.g. &quot;B wins 12 of 15&quot;; &quot;No clear winner&quot; when the counts are within 1</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={kit.prose} style={{ marginTop: 16 }}>
          Every quote in a report is a juror&apos;s own words. The report stores which answer each quote came from, and
          delivery is blocked unless the quote matches that stored answer exactly.
        </p>
      </Section>

      <Section id="limits" title="What can't a verdict tell you?">
        <p className={kit.answer}>
          A verdict is a directional signal from a small number of real people, not a sales guarantee. It&apos;s good at
          catching the big problems and picking the clearer of two messages.
        </p>
        <ul className={kit.prose}>
          <li>
            <strong>Sample size.</strong> {TIERS.proof.jurors} people won&apos;t detect small differences. Treat a 9–6
            result as a lean, not a law.
          </li>
          <li>
            <strong>Audience match.</strong> Jurors qualify by answering a screening question. That narrows the panel
            but it&apos;s self-reported. For buyers defined by job, industry or seniority, use the Specialist Jury.
          </li>
          <li>
            <strong>Words, not design.</strong> Jurors judge your message as text. Layout, images, speed and price
            tables aren&apos;t tested.
          </li>
          <li>
            <strong>First impressions.</strong> {CARD_REVEAL_SECONDS} seconds measures whether your message lands, not
            whether someone would read your whole page or buy.
          </li>
          <li>
            <strong>Public pages only.</strong> Don&apos;t submit anything confidential.
          </li>
        </ul>
      </Section>

      <Section id="guardrails" title="What stops the agents from making expensive mistakes?">
        <p className={kit.answer}>
          Agents decide; code enforces. Agents never touch money directly. They ask the Ops API, and code checks every
          request against fixed limits before anything happens.
        </p>
        <ul className={kit.prose}>
          <li>A jury budget per tier, and no panel launches below a {pct(MARGIN_FLOOR)} gross margin.</li>
          <li>Refunds can never exceed what you paid; refunds for lateness or failure are limited to one per order.</li>
          <li>Full refunds are automatic if your audience can&apos;t be recruited or too few jurors finish by the deadline; pro-rata if some are missing.</li>
          <li>Prices can only move within a fixed band, at most once a day per package.</li>
          <li>Every agent decision is logged with its reasoning.</li>
        </ul>
        <p className={kit.prose}>
          More on how the company runs: <Link href="/about">About JuryHour</Link>.
        </p>
      </Section>

      <FaqBlock
        title="Questions about the method"
        items={faqByIds(["enough", "who-jurors", "verify", "bad-answers", "real-quotes", "cant-recruit"])}
      />
    </main>
  );
}
