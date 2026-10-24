// Hero artifact (WEBSITE_SPEC §5.2): a compact verdict card in HTML, no images. Illustrative and
// labeled "Example verdict" until a real dogfood verdict replaces it. This is the page's one VerdictStamp.
import { Badge, JurorQuote, Tally, VerdictStamp } from "@/components/ui";
import { EXAMPLE_CASE as X } from "./home-content";
import s from "./marketing.module.css";

export function HeroArtifact() {
  return (
    <figure className={s.artifact} aria-labelledby="hero-artifact-cap" style={{ margin: 0 }}>
      <div className={s.artifactHead}>
        <Badge tone="neutral">Example verdict</Badge>
        <span className={`${s.mono} ${s.muted}`}>
          Case {X.caseNo} · {X.tier} · {X.jurors} jurors
        </span>
      </div>

      <ol className={s.versions} aria-label="The two versions jurors judged">
        <li className={s.version}>
          <span className={s.versionTag}>A</span>
          <span className={s.versionText}>
            <span className={s.versionLabel}>Their page</span>
            {X.headlineA}
          </span>
        </li>
        <li className={`${s.version} ${s.versionWin}`}>
          <span className={s.versionTag}>B</span>
          <span className={s.versionText}>
            <span className={s.versionLabel}>Our challenger</span>
            {X.headlineB}
          </span>
        </li>
      </ol>

      <div className={s.tallyRow}>
        <Tally
          total={X.jurors}
          filled={X.preferB}
          label={`${X.preferB} of ${X.jurors} jurors preferred B`}
          animate
        />
        <VerdictStamp>B WINS</VerdictStamp>
      </div>

      <div className={s.quotes}>
        {X.heroQuotes.map((q) => (
          <JurorQuote key={q.juror} juror={q.juror}>
            {q.text}
          </JurorQuote>
        ))}
      </div>

      <figcaption id="hero-artifact-cap" className={s.caption}>
        Example verdict with made-up copy, to show the format. Not a customer&rsquo;s result.
      </figcaption>
    </figure>
  );
}
