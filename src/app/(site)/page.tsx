import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { LandingApp } from "@/components/landing/LandingApp";
import { getLandingData, getShellPrices, type LandingData } from "@/lib/queries";
import { TIERS, type TierName } from "@/lib/constants";

/** DB trouble must never take the landing page down: fall back to constant prices. */
async function landingData(): Promise<LandingData> {
  try {
    return await getLandingData();
  } catch (e) {
    console.error("[landing] data load failed", (e as Error).message);
    return {
      prices: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.price])) as Record<TierName, number | null>,
      salesPaused: false,
      publicVerdicts: [],
    };
  }
}

export default async function Home() {
  // Prices are cached and prerendered into the static shell; sales-paused state and public verdicts stream in.
  const prices = await getShellPrices();
  const data = landingData();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

  return (
    <>
    <main>
      <SiteHeader>
        <nav className="small">
          <a href="#pricing">Prices</a>
        </nav>
      </SiteHeader>
      <LandingApp prices={prices} data={data} turnstileSiteKey={turnstileSiteKey} intro={<Intro />} />
      <Suspense fallback={null}>
        <PublicVerdicts data={data} />
      </Suspense>
    </main>
      <SiteFooter />
    </>
  );
}

function Intro() {
  return (
    <>
      <h1>Before you spend $1,000 on ads, spend $11 to see if real people get your page.</h1>
      <p className="hero-sub">Real buyers. Real verdict. Before you launch.</p>
      <ol className="how">
        <li>
          <span>
            <strong>Paste your page.</strong> A free AI preview shows the line most likely to lose a stranger, and a
            rewrite.
          </span>
        </li>
        <li>
          <span>
            <strong>We write a challenger and hire a jury.</strong> Real, identity-verified people who match your buyer,
            recruited through Terac.
          </span>
        </li>
        <li>
          <span>
            <strong>They judge yours against ours.</strong> Each juror sees both, in random order. You get the winner,
            their own words, and copy ready to paste. Same day.
          </span>
        </li>
      </ol>
    </>
  );
}

async function PublicVerdicts({ data }: { data: Promise<LandingData> }) {
  const { publicVerdicts } = await data;
  if (publicVerdicts.length === 0) return null; // no fake social proof: hide the block until it's real
  return (
    <section className="section" aria-labelledby="verdicts-h">
      <div className="wrap">
        <h2 id="verdicts-h">Recent verdicts, shared by their owners</h2>
        <div className="verdict-cards">
          {publicVerdicts.map((v) => (
            <figure key={v.orderId}>
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic OG PNG, already sized */}
              <img
                src={`/api/og/verdict/${v.orderId}`}
                alt={`Verdict: ${v.verdict}, judged by ${v.n} real people`}
                width={1200}
                height={630}
                loading="lazy"
              />
              <figcaption>
                {v.verdict}, from {v.n} real people
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
