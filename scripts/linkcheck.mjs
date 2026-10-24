#!/usr/bin/env node
// Link check for the marketing site (WEBSITE_SPEC §11).
//
//   node scripts/linkcheck.mjs [baseUrl] [--external=0] [--verbose]
//
// Crawls from "/" and every URL in /sitemap.xml on the base URL (default $LINKCHECK_BASE_URL or
// https://juryhour.vercel.app). Absolute links to the canonical hosts (juryhour.vercel.app,
// juryhour.com, NEXT_PUBLIC_APP_URL) are checked against the base URL, so a local build can be checked
// before deploy. For every internal page it checks:
//   - each <a href>, <link href>, <img src>, <script src> and og:image/twitter:image returns 200
//   - each #fragment points at an element id that exists on the target page
// Private areas (/o, /r, /t, /ops, /api except /api/og) are never crawled.
// External links get a HEAD (falling back to GET) with an 8 s timeout. 401/403/429/999 and timeouts
// from bot-protected sites are reported as warnings; other 4xx/5xx and DNS failures fail the run.
// Exit code 1 if anything internal is broken or an external link is dead.

const args = process.argv.slice(2);
const base = new URL((args.find((a) => !a.startsWith("--")) ?? process.env.LINKCHECK_BASE_URL ?? "https://juryhour.vercel.app").replace(/\/$/, "") + "/");
const checkExternal = !args.includes("--external=0");
const verbose = args.includes("--verbose");
const CANONICAL_HOSTS = new Set(["juryhour.vercel.app", "juryhour.com", "www.juryhour.com", base.host]);
if (process.env.NEXT_PUBLIC_APP_URL) {
  try {
    CANONICAL_HOSTS.add(new URL(process.env.NEXT_PUBLIC_APP_URL).host);
  } catch {}
}
const PRIVATE = /^\/(o|r|t|ops|preview)(\/|$)|^\/api\/(?!og)/;
const SOFT_EXTERNAL = new Set([401, 403, 405, 429, 999]);
const UA = "JuryHour-linkcheck/1.0 (+https://juryhour.vercel.app)";
const CONCURRENCY = 8;

/** @type {Map<string, {status: number, ids?: Set<string>, html?: boolean, finalUrl?: string, error?: string}>} */
const results = new Map();
/** @type {Map<string, Set<string>>} target URL (no hash) → pages that link to it */
const referrers = new Map();
/** @type {{from: string, href: string, fragment: string}[]} */
const fragments = [];
const external = new Map(); // url → Set<from>
let skipped = 0;

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Resolve an href found on `from` → {kind, url} where internal URLs are rewritten onto the base. */
function classify(href, from) {
  href = decode(href.trim());
  if (!href || href.startsWith("javascript:") || href.startsWith("data:") || href.startsWith("blob:")) return null;
  if (/^(mailto|tel|sms):/i.test(href)) {
    skipped++;
    return null;
  }
  let u;
  try {
    u = new URL(href, from);
  } catch {
    return { kind: "bad", url: href };
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (CANONICAL_HOSTS.has(u.host)) {
    const mapped = new URL(u.pathname + u.search + u.hash, base);
    return { kind: "internal", url: mapped };
  }
  return { kind: "external", url: u };
}

function addRef(target, from) {
  if (!referrers.has(target)) referrers.set(target, new Set());
  referrers.get(target).add(from);
}

async function fetchWithTimeout(url, init = {}, ms = 15_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

function extract(html, pageUrl) {
  const ids = new Set();
  for (const m of html.matchAll(/\s(?:id|name)="([^"]+)"/g)) ids.add(decode(m[1]));
  const links = [];
  const crawlable = [];
  for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    links.push(m[1]);
    crawlable.push(m[1]);
  }
  for (const m of html.matchAll(/<link\b[^>]*?\shref="([^"]*)"/g)) links.push(m[1]);
  for (const m of html.matchAll(/<(?:img|script|source)\b[^>]*?\ssrc="([^"]*)"/g)) links.push(m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*?(?:property|name)="(?:og:image|twitter:image)"[^>]*?content="([^"]*)"/g)) links.push(m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*?content="([^"]*)"[^>]*?(?:property|name)="(?:og:image|twitter:image)"/g)) links.push(m[1]);
  return { ids, links, crawlable: new Set(crawlable), pageUrl };
}

const queue = [];
const queued = new Set();
function enqueue(url, from) {
  const key = url.href.split("#")[0];
  addRef(key, from);
  if (queued.has(key)) return;
  queued.add(key);
  queue.push(key);
}

async function checkInternal(key) {
  let res;
  try {
    res = await fetchWithTimeout(key, { redirect: "follow" });
  } catch (err) {
    results.set(key, { status: 0, error: String(err?.message ?? err) });
    return;
  }
  const type = res.headers.get("content-type") ?? "";
  const path = new URL(key).pathname;
  const isHtml = type.includes("text/html");
  const entry = { status: res.status, html: isHtml, finalUrl: res.url };
  results.set(key, entry);
  if (!isHtml || res.status !== 200 || PRIVATE.test(path)) {
    await res.body?.cancel().catch(() => {});
    return;
  }
  const html = await res.text();
  const { ids, links, crawlable } = extract(html, key);
  entry.ids = ids;
  for (const raw of links) {
    const c = classify(raw, key);
    if (!c) continue;
    if (c.kind === "bad") {
      results.set(`bad:${raw}`, { status: 0, error: `unparseable href on ${key}` });
      continue;
    }
    if (c.kind === "external") {
      if (!crawlable.has(raw)) continue; // only anchors count for external checks
      const k = c.url.href.split("#")[0];
      if (!external.has(k)) external.set(k, new Set());
      external.get(k).add(key);
      continue;
    }
    const u = c.url;
    if (u.hash && u.hash.length > 1) fragments.push({ from: key, href: u.href, fragment: decodeURIComponent(u.hash.slice(1)) });
    if (PRIVATE.test(u.pathname)) {
      // Linked private pages (e.g. /o/<token>) aren't crawled; static links to them would be a bug anyway.
      addRef(u.href.split("#")[0], key);
      continue;
    }
    enqueue(u, key);
  }
}

async function pool(items, worker) {
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) await worker(items[i++]);
    }),
  );
}

async function crawl() {
  enqueue(new URL("/", base), "(start)");
  try {
    const res = await fetchWithTimeout(new URL("/sitemap.xml", base));
    const xml = await res.text();
    if (res.status !== 200) results.set(new URL("/sitemap.xml", base).href, { status: res.status });
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const c = classify(m[1], base.href);
      if (c?.kind === "internal") enqueue(c.url, "/sitemap.xml");
      else if (c) results.set(`sitemap:${m[1]}`, { status: 0, error: "sitemap lists a non-canonical host" });
    }
  } catch (err) {
    results.set("sitemap.xml", { status: 0, error: String(err) });
  }
  for (const extra of ["/robots.txt", "/llms.txt", "/llms-full.txt", "/manifest.webmanifest"]) enqueue(new URL(extra, base), "(fixed)");

  let done = 0;
  while (done < queue.length) {
    const batch = queue.slice(done);
    done = queue.length;
    await pool(batch, checkInternal);
  }
}

async function checkExternalUrl(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetchWithTimeout(url, { method, redirect: "follow" }, 8_000);
      await res.body?.cancel().catch(() => {});
      if (method === "HEAD" && (res.status >= 400 || res.status === 0)) continue;
      return { status: res.status };
    } catch (err) {
      if (method === "GET") return { status: 0, error: err?.name === "AbortError" ? "timeout" : String(err?.cause?.code ?? err?.message ?? err) };
    }
  }
  return { status: 0, error: "no response" };
}

const t0 = Date.now();
await crawl();

const failures = [];
const warnings = [];
for (const [key, r] of results) {
  if (r.status === 200) continue;
  const from = [...(referrers.get(key) ?? [])].slice(0, 3).join(", ");
  failures.push(`${r.status || "ERR"} ${key}${r.error ? ` (${r.error})` : ""}${from ? `  ← ${from}` : ""}`);
}
// Private pages linked statically (no token), e.g. "/ops" in a footer, would leak or 404.
for (const [key, froms] of referrers) {
  const path = (() => {
    try {
      return new URL(key).pathname;
    } catch {
      return "";
    }
  })();
  if (PRIVATE.test(path) && !results.has(key)) warnings.push(`private page linked: ${key}  ← ${[...froms].slice(0, 3).join(", ")}`);
}
for (const f of fragments) {
  const target = results.get(f.href.split("#")[0]);
  if (!target || target.status !== 200 || !target.ids) continue;
  if (!target.ids.has(f.fragment)) failures.push(`missing anchor #${f.fragment} on ${f.href.split("#")[0]}  ← ${f.from}`);
}
const dedupFailures = [...new Set(failures)];

let extDead = [];
if (checkExternal) {
  const urls = [...external.keys()];
  const ext = new Map();
  await pool(urls, async (u) => ext.set(u, await checkExternalUrl(u)));
  for (const [u, r] of ext) {
    const from = [...external.get(u)].slice(0, 2).join(", ");
    if (r.status >= 200 && r.status < 400) {
      if (verbose) console.log(`  ext ${r.status} ${u}`);
      continue;
    }
    const line = `${r.status || "ERR"} ${u}${r.error ? ` (${r.error})` : ""}  ← ${from}`;
    if (SOFT_EXTERNAL.has(r.status) || r.error === "timeout") warnings.push(`external (bot-protected?) ${line}`);
    else extDead.push(line);
  }
}

const pages = [...results.values()].filter((r) => r.html && r.status === 200).length;
console.log(`Link check: ${base.origin}`);
console.log(`  ${pages} pages crawled · ${results.size} internal URLs · ${fragments.length} anchors · ${external.size} external links${checkExternal ? "" : " (not checked)"} · ${skipped} mailto/tel skipped · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (verbose) for (const [k, r] of results) console.log(`  ${r.status} ${k}`);
for (const w of warnings) console.log(`  WARN ${w}`);
for (const f of dedupFailures) console.log(`  FAIL ${f}`);
for (const d of extDead) console.log(`  FAIL external ${d}`);
const ok = dedupFailures.length === 0 && extDead.length === 0;
console.log(ok ? "  OK: no broken links" : `  ${dedupFailures.length + extDead.length} broken`);
process.exit(ok ? 0 : 1);
