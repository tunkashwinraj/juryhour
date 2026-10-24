#!/usr/bin/env node
// Lighthouse (mobile) summary for the marketing site's quality bar (WEBSITE_SPEC §11).
//
//   node scripts/lighthouse.mjs [baseUrl] [--paths=/,/pricing,/sample-report] [--runs=1] [--out=dir]
//
// Default base URL: $LH_BASE_URL or https://juryhour.vercel.app. Runs `npx -y lighthouse@13` per page
// (mobile form factor, headless Chrome), prints the four category scores, the failing audits and the
// Core Web Vitals lab numbers, and exits non-zero if any page misses a target:
//   Performance >= 95 · Accessibility = 100 · Best Practices >= 95 · SEO = 100
// With --runs=N the median performance score is used (Lighthouse perf varies run to run).
// Chrome: uses CHROME_PATH if set; otherwise Lighthouse's own discovery, falling back to Playwright's
// Chromium under %LOCALAPPDATA%\ms-playwright on Windows.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const base = (args.find((a) => !a.startsWith("--")) ?? process.env.LH_BASE_URL ?? "https://juryhour.vercel.app").replace(/\/$/, "");
// Paths may be given with or without the leading slash ("pricing,sample-report"; "" or "home" = /),
// which also sidesteps Git Bash rewriting "/pricing" into a Windows path.
const paths = flag("paths", "/,/pricing,/sample-report")
  .split(",")
  .map((p) => p.trim())
  .map((p) => (p === "" || p === "home" ? "/" : p.startsWith("/") ? p : `/${p}`));
const runs = Math.max(1, Number(flag("runs", "1")) || 1);
const outDir = flag("out", join(tmpdir(), "juryhour-lighthouse"));
mkdirSync(outDir, { recursive: true });

const TARGETS = { performance: 95, accessibility: 100, "best-practices": 95, seo: 100 };

function playwrightChromium() {
  const root = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (!root || !existsSync(root)) return null;
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const sub of ["chrome-win64", "chrome-win"]) {
      const exe = join(root, d, sub, "chrome.exe");
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

const env = { ...process.env };
if (!env.CHROME_PATH && process.platform === "win32") {
  const stable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  env.CHROME_PATH = existsSync(stable) ? stable : playwrightChromium() ?? undefined;
}

function runOnce(url, file) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(
    npx,
    [
      "-y",
      "lighthouse@13",
      url,
      "--form-factor=mobile",
      "--output=json",
      `--output-path=${file}`,
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
    ],
    { env, stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let failed = false;

for (const path of paths) {
  const url = base + path;
  const reports = [];
  for (let i = 0; i < runs; i++) {
    const file = join(outDir, `${path.replace(/^\/+/, "").replace(/\W+/g, "_") || "home"}-${i}.json`);
    try {
      reports.push(runOnce(url, file));
    } catch (err) {
      console.error(`  lighthouse failed for ${url} (run ${i + 1}): ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  }
  if (reports.length === 0) {
    failed = true;
    console.log(`\n${url}\n  no report (see error above)   FAIL`);
    continue;
  }
  const perfScores = reports.map((r) => Math.round((r.categories.performance?.score ?? 0) * 100));
  const pick = reports[perfScores.indexOf(median(perfScores))];
  const score = (id) => (id === "performance" ? median(perfScores) : Math.round((pick.categories[id]?.score ?? 0) * 100));
  const scores = Object.fromEntries(Object.keys(TARGETS).map((id) => [id, score(id)]));
  const misses = Object.entries(TARGETS).filter(([id, t]) => scores[id] < t);
  if (misses.length) failed = true;

  const a = pick.audits;
  const metric = (id) => a[id]?.displayValue ?? "n/a";
  console.log(
    `\n${url}\n  P ${scores.performance}${runs > 1 ? ` (runs: ${perfScores.join("/")})` : ""} · A ${scores.accessibility} · BP ${scores["best-practices"]} · SEO ${scores.seo}` +
      `   ${misses.length ? "FAIL" : "ok"}` +
      `\n  FCP ${metric("first-contentful-paint")} · LCP ${metric("largest-contentful-paint")} · TBT ${metric("total-blocking-time")} · CLS ${metric("cumulative-layout-shift")} · SI ${metric("speed-index")}` +
      ` · unthrottled FCP ${Math.round(a.metrics?.details?.items?.[0]?.observedFirstContentfulPaint ?? NaN)} ms`,
  );
  // Failing audits that count toward a category score (weight > 0), plus perf opportunities.
  for (const [catId, cat] of Object.entries(pick.categories)) {
    const bad = cat.auditRefs
      .filter((ref) => ref.weight > 0 || catId === "performance")
      .map((ref) => a[ref.id])
      .filter((au) => au && au.score !== null && au.score < 0.9 && au.scoreDisplayMode !== "informative" && au.scoreDisplayMode !== "notApplicable");
    for (const au of bad) {
      console.log(`  - [${catId}] ${au.id}: ${au.title}${au.displayValue ? ` (${au.displayValue})` : ""}`);
    }
  }
}

console.log(`\nJSON reports: ${outDir}`);
process.exit(failed ? 1 : 0);
