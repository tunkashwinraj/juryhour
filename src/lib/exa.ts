// Exa client (SPEC §11.3). Request shapes follow .claude/skills/build-with-exa:
// on /contents the content fields are top-level; on /search they nest inside `contents`.

const EXA_BASE = "https://api.exa.ai";
const PAGE_TEXT_MAX_CHARS = 6000;
const MARKET_SEARCH_RESULTS = 5;

export type ExaCost = { costDollars: number };

export type PageText = ExaCost & {
  url: string;
  title: string | null;
  text: string;
};

export type MarketResult = {
  url: string;
  title: string | null;
  highlights: string[];
};

export class ExaError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ExaError";
    this.status = status;
  }
}

async function exaPost<T>(path: string, body: unknown): Promise<T> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new ExaError("EXA_API_KEY is not set");

  const res = await fetch(`${EXA_BASE}${path}`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new ExaError(`Exa ${path} failed: ${res.status} ${await res.text()}`, res.status);
  }
  return res.json() as Promise<T>;
}

type ContentsResponse = {
  results: { url: string; title?: string | null; text?: string }[];
  statuses?: { id: string; status: string; error?: { tag?: string } }[];
  costDollars?: { total?: number };
};

/** Fetch readable page text for one URL, capped for the preview prompt. */
export async function getPageText(url: string): Promise<PageText> {
  const data = await exaPost<ContentsResponse>("/contents", {
    urls: [url],
    text: { maxCharacters: PAGE_TEXT_MAX_CHARS },
  });

  // /contents returns 200 even when a URL fails; the per-URL status is authoritative.
  const status = data.statuses?.find((s) => s.id === url) ?? data.statuses?.[0];
  if (status && status.status !== "success") {
    throw new ExaError(`Could not read ${url}: ${status.error?.tag ?? status.status}`);
  }
  const page = data.results[0];
  if (!page?.text) throw new ExaError(`No text extracted from ${url}`);

  return {
    url: page.url,
    title: page.title ?? null,
    text: page.text,
    costDollars: data.costDollars?.total ?? 0,
  };
}

type SearchResponse = {
  results: { url: string; title?: string | null; highlights?: string[] }[];
  costDollars?: { total?: number };
};

/** Competitor and category-language search for the Researcher. */
export async function searchMarket(
  query: string,
): Promise<ExaCost & { results: MarketResult[] }> {
  const data = await exaPost<SearchResponse>("/search", {
    query,
    type: "auto",
    numResults: MARKET_SEARCH_RESULTS,
    contents: { highlights: true },
  });

  return {
    results: data.results.map((r) => ({
      url: r.url,
      title: r.title ?? null,
      highlights: r.highlights ?? [],
    })),
    costDollars: data.costDollars?.total ?? 0,
  };
}
