import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { OrderStatusLive } from "@/components/order/OrderStatusLive";
import { getOrderStatus } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function OrderPage({ params, searchParams }: Props) {
  return (
    <>
    <main>
      <SiteHeader />
      <div className="wrap narrow section">
        <Suspense fallback={<p className="skeleton">Loading your order…</p>}>
          <OrderLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
      <SiteFooter />
    </>
  );
}

async function OrderLoader({ params, searchParams }: Props) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  let order = null;
  try {
    order = await getOrderStatus(token);
  } catch (e) {
    console.error("[/o] lookup failed", (e as Error).message);
    return (
      <div className="notice notice-warn" role="alert">
        <p>We couldn&apos;t load your order just now. Refresh this page in a few seconds.</p>
      </div>
    );
  }
  if (!order) {
    return (
      <>
        <h1>We can&apos;t find that order</h1>
        <p className="muted">
          Check that you opened the full link from your email. Order links are long and private, so a missing character
          breaks them.
        </p>
        <Link href="/">Back to JuryHour</Link>
      </>
    );
  }
  return <OrderStatusLive initial={order} paidParam={sp.paid === "1"} />;
}
