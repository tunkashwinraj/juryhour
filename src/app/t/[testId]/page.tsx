// /t/[testId]?sid=… — the juror test page (SPEC §9). Neutral, unbranded, mobile-first.
// The shell is static; params/searchParams are read inside <Suspense> (Cache Components). The test
// itself is fetched client-side from /api/juror/test/[testId] so it is always fresh (and mockable in e2e).
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { pickSid } from "../rules";
import JurorApp from "./JurorApp";
import styles from "./juror.module.css";

// Neutral tab: no "· JuryHour" title suffix and a blank icon instead of the root brand favicon
// (explicit icons here replace the inherited app/icon.svg + apple-icon; a blank one also stops the
// browser from falling back to /favicon.ico).
const BLANK_ICON = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";

export const metadata: Metadata = {
  title: { absolute: "Quick feedback task" },
  description: "Read a short description and share your honest reaction.",
  robots: { index: false, follow: false },
  icons: { icon: BLANK_ICON, apple: [], shortcut: [] },
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
