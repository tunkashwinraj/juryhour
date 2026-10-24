// GET /api/og?title=&eyebrow= — default 1200×630 share image for marketing pages (pageMetadata in
// @/lib/seo points here). Public, no data access; cached at the edge for a day.
import { ImageResponse } from "next/og";
import { OG_SIZE, loadOgFonts, ogImage, ogText } from "@/components/ui/og";

const DEFAULT_TITLE = "Find out if strangers get your page before you pay to send them there.";

function param(sp: URLSearchParams, key: string, max: number): string | undefined {
  const v = sp.get(key)?.trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : undefined;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const input = {
    title: param(sp, "title", 140) ?? DEFAULT_TITLE,
    eyebrow: param(sp, "eyebrow", 48),
    tally: { filled: 12, total: 15 },
  };
  try {
    const [displayText, monoText] = ogText(input);
    const fonts = await loadOgFonts(displayText, monoText);
    return new ImageResponse(ogImage(input), {
      ...OG_SIZE,
      fonts,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return new Response("Could not render this image", { status: 500 });
  }
}
