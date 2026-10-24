import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Button, Section } from "@/components/ui";
import { getPublicVerdicts, type LandingData } from "@/lib/queries";
import { pageMetadata } from "@/lib/seo";
import { PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "Public verdicts from real juries",
  description:
    "Verdict cards customers chose to share: which version of their page won, judged by real people. Opt-in only.",
  path: "/verdicts",
  ogTitle: "Public verdicts",
});

/** Opt-in share cards from delivered live reports. Read per request, outside the static shell. */
async function VerdictGrid() {
  await connection();
  let verdicts: LandingData["publicVerdicts"] = [];
  try {
    verdicts = await getPublicVerdicts();
  } catch (e) {
    console.error("[/verdicts] load failed", (e as Error).message);
  }
  if (verdicts.length === 0) {
    return (
      <div className={kit.prose}>
        <p>
          <strong>No public verdicts yet.</strong> Customers decide whether their verdict is shown here, and none are
          public right now. We won&apos;t fill this page with made-up examples.
        </p>
        <p>
          To see what a full report looks like, open the <Link href="/sample-report">sample report</Link> (clearly labeled as
          an example).
        </p>
      </div>
    );
  }
  return (
    <ul className={kit.verdictGrid}>
      {verdicts.map((v) => (
        <li key={v.orderId}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic OG route, already sized 1200×630 */}
          <img
            src={`/api/og/verdict/${v.orderId}`}
            alt={`Verdict card: ${v.verdict}, from ${v.n} real ${v.n === 1 ? "person" : "people"}`}
            width={1200}
            height={630}
            loading="lazy"
          />
          <p style={{ margin: "8px 0 0" }}>
            {v.verdict} <span className={kit.muted}>· {v.n} real {v.n === 1 ? "person" : "people"}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function VerdictsPage() {
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "Verdicts", path: "/verdicts" }]}
        eyebrow="PUBLIC VERDICTS"
        title="What have real juries decided?"
        lede="These are verdict cards customers chose to make public from their own reports. Each one comes from real, approved juror answers. Nothing here is shown without the customer's opt-in."
      />
      <Section id="gallery" title="Which verdicts have customers shared?">
        <Suspense fallback={<p className={kit.muted}>Loading verdicts…</p>}>
          <VerdictGrid />
        </Suspense>
      </Section>
      <Section id="share" title="How do I share my own verdict?">
        <p className={kit.answer}>
          Open your report and tick &quot;allow JuryHour to show this card publicly&quot; under Share my verdict. Untick it
          any time to remove it.
        </p>
        <div className={kit.actions}>
          <Button href="/#preview" variant="primary">
            Get a free preview
          </Button>
        </div>
      </Section>
    </main>
  );
}
