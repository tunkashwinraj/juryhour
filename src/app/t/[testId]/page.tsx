// /t/[testId]?sid=… — the juror test page (SPEC §9). Neutral, unbranded, mobile-first.
// The shell is static; params/searchParams are read inside <Suspense> (Cache Components). The test
// itself is fetched client-side from /api/juror/test/[testId] so it is always fresh (and mockable in e2e).
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { pickSid } from "../rules";
import JurorApp from "./JurorApp";
import styles from "./juror.module.css";

export const metadata: Metadata = {
  title: "Quick feedback task",
  description: "Read a short description and share your honest reaction.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
};

type Props = {
  params: Promise<{ testId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function JurorPage({ params, searchParams }: Props) {
  return (
    <div className={styles.root} data-neutral>
      <main className={styles.main}>
        <Suspense fallback={<p className={styles.muted} role="status">Loading…</p>}>
          <JurorLoader params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function JurorLoader({ params, searchParams }: Props) {
  const { testId } = await params;
  const sid = pickSid(await searchParams);
  return <JurorApp testId={testId} sid={sid} />;
}
