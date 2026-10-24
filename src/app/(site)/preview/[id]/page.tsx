// /preview/[id] — a stored free preview, shareable by link (WEBSITE_SPEC §7.3). noindex, dynamic.
// Shows only fields from the `previews` row (never the email); refused previews show the refusal
// and no pricing. The static shell is the heading; the row streams in behind <Suspense>.
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Section } from "@/components/ui";
import { PreviewPageClient } from "@/components/preview/PreviewPageClient";
import { isUuid, previewRowToStored, type PreviewRow } from "@/components/preview/logic";
import { db } from "@/lib/db";
import { activeLaunchOffer } from "@/lib/launch";
import { getShellPrices } from "@/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Your free preview",
  description: "An AI read of a landing page: headline, weakest line, a rewrite and who would judge it.",
  path: "/preview",
  noindex: true,
});

async function StoredPreviewById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await connection();
  const res = await db()
    .from("previews")
    .select(
      "id, url, pitch_text, buyer_desc, headline, weakest_line, rewrite_suggestion, recommended_panel, safety_verdict, safety_reason, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error(`previews: ${res.error.message}`);
  if (!res.data) notFound();
  const row = res.data as PreviewRow;
  const prices = await getShellPrices();
  const offer = activeLaunchOffer(new Date(), prices);
  return <PreviewPageClient serverPreview={previewRowToStored(row)} prices={prices} offer={offer} />;
}

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main id="main">
      <Section eyebrow="FREE PREVIEW · AI READ" title="Your free preview" lede="What a stranger takes from this page in 5 seconds, according to our AI. Real people confirm or overturn it.">
        <Suspense fallback={<p role="status">Loading your preview…</p>}>
          <StoredPreviewById params={params} />
        </Suspense>
      </Section>
    </main>
  );
}
