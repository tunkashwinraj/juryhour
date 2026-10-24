import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ReportView } from "@/components/report/ReportView";
import { getCurrentPrices, getReportData } from "@/lib/queries";
import { TIERS } from "@/lib/constants";
import { activeCoupon } from "@/lib/coupons";
import { nowMs } from "@/components/rules";

export const metadata: Metadata = {
  title: "Your verdict",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default function ReportPage({ params }: Props) {
  return (
    <>
    <main>
      <SiteHeader />
      <div className="wrap narrow section">
        <Suspense fallback={<p className="skeleton">Loading your verdict…</p>}>
          <ReportLoader params={params} />
        </Suspense>
      </div>
    </main>
      <SiteFooter />
    </>
  );
}

async function ReportLoader({ params }: Props) {
  await connection();
  const { token } = await params;
  let data: Awaited<ReturnType<typeof getReportData>> = null;
  let prices: Awaited<ReturnType<typeof getCurrentPrices>> | null = null;
  try {
    [data, prices] = await Promise.all([getReportData(token), getCurrentPrices()]);
  } catch (e) {
    console.error("[/r] load failed", (e as Error).message);
    return (
      <div className="notice notice-warn" role="alert">
        <p>We couldn&apos;t load your report just now. Refresh this page in a few seconds.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <>
        <h1>We can&apos;t find that report</h1>
        <p className="muted">Open the full link from your email. Report links are long and private.</p>
        <Link href="/">Back to JuryHour</Link>
      </>
    );
  }
  if (!data.report) {
    return (
      <>
        <h1>Your verdict isn&apos;t ready yet</h1>
        <p className="muted">Your jury is still at work. We email you the moment it&apos;s ready.</p>
        <Link className="btn" href={`/o/${data.token}`}>
          See live progress
        </Link>
      </>
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <ReportView
      data={{ ...data, report: data.report }}
      appUrl={appUrl}
      nowMs={nowMs()}
      prices={{ proof: prices?.proof ?? TIERS.proof.price, retest: prices?.retest ?? TIERS.retest.price }}
      coupon={activeCoupon()}
    />
  );
}
