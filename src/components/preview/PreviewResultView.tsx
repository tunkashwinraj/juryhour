// What the free preview found (WEBSITE_SPEC §7.3): headline read, weakest line, rewrite, who we'd
// recruit. Presentational only, so the hero (client) and /preview/[id] (server) share it.
import type { PreviewView } from "./logic";
import styles from "./preview.module.css";

export function PreviewResultView({ result, headingLevel = 3 }: { result: PreviewView; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const rows: { label: string; value: string; kind: "quote" | "rewrite" | "plain" }[] = [
    { label: "What a stranger reads as your headline", value: result.headline, kind: "quote" },
    { label: "Your weakest line", value: result.weakest_line, kind: "quote" },
    { label: "How we'd rewrite it", value: result.rewrite_suggestion, kind: "rewrite" },
    { label: "Who we'd recruit for your jury", value: result.recommended_panel, kind: "plain" },
  ];
  return (
    <div className={styles.result}>
      {rows.map((r) => (
        <section key={r.label} className={styles.resultRow}>
          <H className={styles.resultLabel}>{r.label}</H>
          {r.kind === "quote" ? (
            <blockquote className={styles.quote}>{r.value}</blockquote>
          ) : (
            <p className={r.kind === "rewrite" ? styles.rewrite : undefined}>{r.value}</p>
          )}
        </section>
      ))}
      <p className={styles.small}>This is an AI read of your page, not a jury. Real people confirm or overturn it.</p>
    </div>
  );
}

/** Refusal (WEBSITE_SPEC §7.4). No pricing is rendered anywhere while this shows. */
export function PreviewRefusalView({ reason }: { reason?: string | null }) {
  return (
    <div className={styles.refusal}>
      <p className={styles.refusalTitle}>
        <strong>We can&apos;t test this product.</strong>
      </p>
      {reason ? <p>{reason}</p> : null}
      <p className={styles.small}>
        We don&apos;t run juries on gambling or trading picks, adult content, get-rich-quick offers, scams, hate,
        weapons, illegal goods or MLM.
      </p>
    </div>
  );
}
