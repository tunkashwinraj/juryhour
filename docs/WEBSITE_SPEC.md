# JuryHour Marketing Website — Redesign Prompt for Claude Code

> Paste this whole document into Claude Code inside the existing JuryHour repo. Save it as `docs/WEBSITE_SPEC.md`. It extends `SPEC.md`; where they conflict on the marketing site, this document wins. Do not change business logic in `/api/*`, `/o`, `/t`, `/r` or `/ops` except where this document says so.

---

## 0. Context and goal

JuryHour is live at https://juryhour.vercel.app (to become https://juryhour.com). It's a company with zero employees: a founder pastes a landing page, an AI agent writes a challenger version, real identity-verified people recruited through Terac judge original vs challenger, and the founder gets the verdict and winning copy the same day. Payments run on Whop.

The current page works but looks like a prototype. We are **selling today**, so the redesign must ship in phases without ever breaking the free preview or checkout.

**Goal:** a professional, fast, trustworthy marketing site that turns a founder who lands cold into (1) a free preview user within 30 seconds and (2) a paying customer within 3 minutes, and that reads as a serious research product, not a hackathon demo.

**Primary conversion:** run the free preview. **Secondary:** buy Proof ($149, launch price $99 today). **Tertiary:** buy Spark ($11).

---

## 1. Phase plan (ship in this order; deploy after each)

| Phase | Deadline | Scope |
|---|---|---|
| **1 — Hotfix** | 20 min | Fix the four live bugs (§2). Deploy to production. |
| **2 — Selling core** | +2 h | Design system, new home page, pricing page, sample report page, legal pages (privacy, terms, refunds), launch-offer banner, analytics events, SEO basics, juryhour.com domain + redirect. Deploy. |
| **3 — Full site** | +3 h | Segment landing pages, compare pages, FAQ, about, affiliates, agents/MCP page, verdict gallery, blog scaffold, contact, changelog. Deploy. |
| **4 — QA & polish** | +1 h | Lighthouse, accessibility, cross-device, link check, copy review. Deploy. |

Use parallel subagents in Phases 2–3 (§12). Never deploy a build that breaks `/api/preview` or `/api/checkout`; run the smoke test in §11 before every production deploy.

---

## 2. Phase 1 hotfix (live bugs found on the current page)

1. **"Loading prices…" never resolves.** Pricing must render on the server from `src/lib/constants.ts` (and the `prices` table when available) with no client fetch on first paint. If the DB read fails, fall back to constants silently. Never show a loading state for prices.
2. **The $11 tier has no name.** It is **Spark**.
3. **Raw metadata leaks into the body** (meta tags / front-matter delimiters visible as text). Move all metadata into Next.js `metadata` exports; remove any stray front matter or `<head>` markup rendered inside components.
4. **URL / "Paste your pitch instead" toggle has no visible state.** Replace with a two-option segmented control (`role="tablist"`), clear selected state, keyboard accessible.

Also: add a footer (§5.12) and link "Terac" to https://terac.com.

---

## 3. Design direction

### Concept: "the verdict"
JuryHour's world is a jury reaching a verdict: case files, juror numbers, tallies, a stamped decision. Use that vernacular as **content and structure**, not costume. No gavels, scales of justice, wood textures or courtroom clip-art.

Subject-native details to use:
- **Juror labels** (`Juror 06`) in a monospaced utility face wherever a quote appears.
- **Tally** visual for results: 15 small marks, filled for the winner (e.g. 12 filled, 3 outlined). This is the signature graphic; reuse it in the hero, sample report, share cards and pricing.
- **Verdict stamp:** a single restrained rotated-label treatment ("VERDICT: B WINS 12–3") used once on the home page and on the sample report. Nowhere else.
- **Case-file header** for reports: `Case 0142 · Proof · 15 jurors · delivered 3h 40m`.
- **5-second timer** motif in "How it works" (a thin progress bar that fills in 5 s, honoring reduced motion).

### Palette (define as tokens; light and dark both designed)
- `--paper`: a cool, slightly blue-tinted off-white (not cream).
- `--ink`: deep ink navy for text.
- `--muted`: blue-grey for secondary text.
- `--rule`: hairline borders.
- `--verdict`: a confident stamp red, used sparingly (stamp, winner tally, one CTA state). Not the primary button color everywhere.
- `--signal`: a calm green for "winner" deltas and positive scores.
- `--focus`: high-contrast focus ring color.
Dark mode: ink background, paper text, same accents adjusted for contrast. Both themes must pass WCAG AA.

### Typography (via `next/font`, self-hosted)
- **Display:** a distinctive editorial serif with character for H1/H2 only (pick one that is not the generic default; e.g. Instrument Serif, Newsreader, or Source Serif 4 Display — choose and stick to it).
- **Body/UI:** a clean, highly legible grotesk (e.g. Geist, IBM Plex Sans, or Public Sans). Not Inter-only.
- **Utility/data:** a monospace for juror labels, case numbers, prices, counters (e.g. IBM Plex Mono or Geist Mono).
- Type scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64. Body 16–18px, 65ch max line length. `text-wrap: balance` on headings. Tabular numerals for prices and scores.

### Avoid (these read as AI-generated or templated)
Purple-to-blue gradient heroes, cream + terracotta, neon accent on black, emoji as section markers, every element centered, identical rounded-xl cards with drop shadows everywhere, fake logo walls, fake testimonials, stock photos of people at laptops, 3D blobs, "trusted by 10,000+ founders" with no data.

### Layout
- 12-column grid, max content width ~1200px, generous whitespace, left-aligned text by default.
- Mobile-first; flawless at 375px. No horizontal scroll ever.
- Cards only where an object is genuinely separate (pricing tiers, report excerpts, juror quotes).
- Motion: one orchestrated moment (hero tally filling in) plus subtle hover/press states. Respect `prefers-reduced-motion`.

Create `src/styles/tokens.css` (or Tailwind theme) with every token, and a `/styleguide` route (noindex) showing colors, type, buttons, inputs, cards, tally, stamp, quote, badge, table.

---

## 4. Information architecture

```
/                         Home
/how-it-works             Method in depth (recruiting, randomization, grading, stats, limits)
/pricing                  All packages, add-ons, comparison, FAQ
/sample-report            Full example verdict (labeled clearly; real dogfood once available)
/for/whop-sellers         Segment landing page
/for/lovable-builders     Segment landing page (also covers Bolt, Replit, Cursor, v0)
/for/agencies             Partner/white-label + 30% affiliate
/compare                  JuryHour vs Wynter vs PickFu vs UserTesting vs "ask friends"
/compare/wynter           Head-to-head
/compare/pickfu           Head-to-head
/verdicts                 Opt-in public verdict gallery (share cards)
/blog, /blog/[slug]       MDX blog
/faq                      All FAQs (FAQPage schema)
/about                    "A company with zero employees" — how it runs, the guardrails, live counters
/agents                   For AI agents & developers: MCP server, tools, example calls
/affiliates               30% affiliate program via Whop
/contact                  Support email (visible text + copy button), response-time promise
/changelog                Dated updates (fresh-content signal)
/legal/privacy            Privacy policy (customers + jurors)
/legal/terms              Terms of service
/legal/refunds            Refund policy (matches code rules)
/styleguide               Internal, noindex

Existing, keep working (restyle with tokens only): /o/[token], /t/[testId], /r/[token], /ops
```

Navigation (desktop): JuryHour wordmark · How it works · Pricing · Sample report · For agencies · Compare · [Get a free preview] button.
Mobile: wordmark + "Free preview" button + menu sheet.
Sticky header with backdrop; respects safe-area insets.

---

## 5. Home page — section by section

Write real copy (below). Keep claims honest; no invented numbers.

### 5.1 Launch-offer bar (configurable)
`Launch price: Proof $99 (normally $149) until 6:00pm ET today.` with a link to pricing. Driven by env/DB (`LAUNCH_OFFER_ENDS_AT`, `LAUNCH_OFFER_CODE=TODAY99`). Hidden automatically after the end time. Countdown only to the real end time; never reset.

### 5.2 Hero
- Eyebrow (mono): `REAL PEOPLE · REAL VERDICT · SAME DAY`
- H1: **"Find out if strangers get your page before you pay to send them there."**
  (Alternative to A/B test later: "Before you spend $1,000 on ads, spend $11 to see if real people get your page.")
- Sub: "Paste your landing page. Our agent writes a challenger, hires real, identity-verified people who match your buyer, and has them judge yours against ours. You get the winner and the copy to paste."
- **Inline preview input** right in the hero: single URL field + "Get free preview" button. "or paste your pitch" link opens the full form.
- Microcopy under input: "Free AI preview in about 10 seconds. No card, no login."
- Right side (desktop) / below (mobile): **the hero artifact**, a compact verdict card: two headline versions (A and B), the tally filling in (12 of 15), the stamp "B WINS", two juror quotes with mono labels. Label it "Example verdict" until a real dogfood verdict exists; then swap in the real one (with permission it's our own page).

### 5.3 Trust strip (facts only)
`Jurors recruited and identity-verified through Terac · Payments by Whop · Every quote traceable to a real juror · Directional research, not a sales guarantee`
Text only. Do not use partner logos unless we have written permission (add a TODO with a flag `PARTNER_LOGOS_APPROVED=false`).

### 5.4 The problem
H2: "Most landing pages fail the 5-second test. Nobody tells the founder."
Three short points, each with a mono label:
- `YOUR FRIENDS` — "Say it looks great. They're not your buyer."
- `YOUR ANALYTICS` — "Show people leave. Not why."
- `YOUR AD SPEND` — "Keeps buying traffic for a page strangers don't understand."

### 5.5 How it works (3 steps; real sequence, so numbering is justified)
1. **Paste your page.** "Free AI preview shows what your page says in 5 seconds, your weakest line, and a rewrite."
2. **We hire your jury.** "An agent writes a challenger and recruits real people who match your buyer through Terac. Each sees both versions for 5 seconds, in random order, without knowing which is yours."
3. **You get the verdict.** "Which version won and by how much, what confused people in their own words, and the winning copy ready to paste. Same day."
Include the 5-second timer motif. Link: "Read the full method →" /how-it-works.

### 5.6 What you get (sample report excerpt)
A real-looking (labeled) excerpt of the report: case header, verdict line, scorecard (Understood after 5 s: 4/15 → 13/15; Clarity 3.1 → 5.8; Would try 2.9 → 4.9), top fix with two juror quotes, winning copy block with a Copy button. CTA: "See the full sample report →".

### 5.7 Pricing (server-rendered; same component as /pricing)
Five tiers in this order, Proof visually emphasized as "Most chosen" only once we have data; until then "Recommended":
- **Spark — $11** · 3 real people · 2-minute first impression of your headline · AI critique · 1 rewritten headline (untested) · same day
- **Pulse — $49** · 10 real people · 4-minute reaction to your current page · full report with anonymous quotes · rewritten hero section (untested) · same day
- **Proof — $149 (launch $99 today)** · 15 real people · your page vs our rewrite, random order · verdict, scorecard, top fixes, winning copy · same day
- **Launch Pack — $199** · Proof now + a free retest after you update your page · see your own before and after
- **Specialist Jury — from $499** · 8 verified professionals matching your buyer (job, industry, seniority) · buyer objections and price reaction · 24–72 h · "Get a quote"
Below: add-ons (+5 jurors $15, rush $9, second page $9) and "Your Spark counts toward Proof if you upgrade within 24 hours."
Each button opens the full preview form pre-selected to that tier if the visitor hasn't run a preview yet; if they have, it goes straight to checkout with the preview data.

### 5.8 Run by agents (honest, live)
H2: "A company with zero employees."
Short paragraph: agents research, write, recruit, grade, report and handle refunds; code enforces every money limit; humans appear only as paid jurors.
**Live counters from the database** (verdicts delivered, real people heard, average delivery time). Render a counter only if its value is ≥ 1; otherwise hide the counter block entirely. Never seed or fake these numbers. Link to /about.

### 5.9 Who it's for (three cards linking to segment pages)
- Whop sellers — "Your sales page is your business. Find out why visitors don't buy."
- Lovable, Bolt & Replit builders — "You built it in a weekend. Find out tonight if anyone gets it."
- Agencies — "Hand clients real-buyer evidence with every page you ship. Earn 30%."

### 5.10 Compare (compact table; full version on /compare)
Rows: Real people · Rewrites your copy · Tests old vs new · Price per test · Turnaround · Setup. Columns: JuryHour · Wynter · PickFu · UserTesting · Asking friends. Use only facts we can source (Wynter: verified B2B panel, 12–48 h, plans from $20K/yr; PickFu: from $1/response, consumer polls). Footnote with sources and "as of Oct 2026".

### 5.11 FAQ (8 questions; FAQPage schema)
Who are the jurors? · How do you verify them? · Will strangers see my unreleased product? (Public pages only today; don't submit confidential material.) · Is 15 people enough? (Directional signal, not a scientific study; explains when to use Specialist.) · How fast? · What if you can't recruit my audience? (Automatic refund.) · Do you edit my site? (No, we deliver copy.) · Refunds? (Link to policy.)

### 5.12 Final CTA + footer
CTA band: "Your page has 5 seconds. Find out what happens in them." + inline URL input.
Footer columns: Product (How it works, Pricing, Sample report, Compare, Verdicts) · For (Whop sellers, Lovable builders, Agencies, AI agents) · Company (About, Changelog, Blog, Affiliates, Contact) · Legal (Privacy, Terms, Refunds). Bottom line: "© 2026 JuryHour · Research, not a sales guarantee · Jurors recruited through Terac".

---

## 6. Other pages (content requirements)

- **/how-it-works:** the full method: recruiting via Terac (screening questions, identity verification), what jurors see (5-second exposure, randomized order, blind to which is original), the exact questions, quality checks (time on task, attention check, minimum answer length, AI grading; rejected work isn't paid for), how stats are computed (in SQL; every quote traceable), limits (sample size, audience match, public pages only). Include a diagram of the flow (inline SVG, theme-aware).
- **/pricing:** the pricing component, a full feature-comparison table across tiers, add-ons, upgrade credit, Specialist quote form, pricing FAQ, refund summary.
- **/sample-report:** a complete report in the real report layout (reuse `/r` components): case header, verdict, scorecard, top 3 fixes with quotes, winning copy, still-unsolved, all responses, method & caveats. Banner: "Example report. Names and numbers are illustrative." Swap to the real dogfood report via a config flag once it exists.
- **Segment pages (/for/*):** hero tailored to the segment, segment-specific problem, a segment-relevant example (Whop sales page; Lovable SaaS page; agency client page), pricing component with the most relevant tier highlighted, segment FAQ, promo code field pre-filled from `?code=` (LOVABLE, WHOP, etc.).
- **/for/agencies:** white-label report option, 30% affiliate via Whop, agency bundle (5 Proofs), "free Proof on one live client page" offer form (writes a lead row; no auto-email beyond a confirmation).
- **/compare, /compare/[competitor]:** honest tables, sourced, dated. No disparagement; state where competitors are better (e.g. Wynter's B2B panel depth).
- **/about:** the zero-employee company: agent roles, guardrails ("agents decide, code enforces"), built at the Zero-Human Company Hackathon by Terac at Whop HQ (Oct 24, 2026), live counters (same honesty rule), founder line: "Founded by Ashwin Raj Tunk, Founder & CEO."
- **/agents:** for developers and AI agents: what the JuryHour MCP does, tool list (`juryhour_preview`, `juryhour_quote`, `juryhour_create_test` → returns a Whop checkout URL, `juryhour_get_verdict`), example calls, auth notes, rate limits. Mark "coming soon" for anything not yet shipped.
- **/verdicts:** grid of opt-in share cards from delivered reports (only where the customer ticked "allow JuryHour to show this publicly"); empty state if none.
- **/blog:** MDX with frontmatter (title, description, date, author); index page; article layout with table of contents; first post stub: "How I built a company with zero employees in one day". Do not mass-generate posts.
- **/faq:** all FAQs grouped (Product, Jurors, Privacy, Pricing & refunds, Agencies, Agents).
- **/affiliates:** 30% commission, 30-day hold (Whop), how to join (Whop affiliate link), promo assets.
- **/contact:** support email as visible text with a copy button (mailto links are unreliable in some contexts); expected response time ("same day, handled by our support agent"); order lookup by email (sends status-link email).
- **/changelog:** dated entries, newest first.
- **Legal pages:** see §8.

---

## 7. Preview & checkout flow (fully operational)

Reuse existing `/api/preview` and `/api/checkout`. The marketing site must:

1. **Hero quick input** (URL only) → expands into the full form inline (URL/pitch toggle, "Who's your buyer?", email, Turnstile) without a page change. Validate URL format client-side; normalize (add https://).
2. **Loading state** with honest progress copy: "Reading your page… Finding the weakest line… Writing a rewrite…" (timed to real request; no fake delays).
3. **Result view** (inline, sharable at `/preview/[id]` if the API returns an id; noindex): what we read (headline), weakest line + why, AI rewrite, who we'd recruit, then the upsell: three tier cards (Spark, Proof [recommended], Pulse) with the preview already attached. Copy: "This is AI guessing. Want real people to judge it?"
4. **Refusal view** for blocked categories: "We can't test this product." No pricing shown.
5. **Errors:** page unreachable → "We couldn't read that page. Paste your pitch instead?" with the toggle pre-switched. Rate limited → plain explanation and when to retry.
6. **Checkout:** POST to `/api/checkout` with tier, add-ons, preview id, promo code (from `?code=` or a "Have a code?" field), `src`. Redirect to Whop `purchase_url`. Show a "Secure checkout by Whop" line.
7. **Capacity state:** if `company_state.sales_paused`, buttons become "Join the waitlist" (email capture) and a banner explains.
8. **Persist** the last preview in sessionStorage (try/catch) so pricing buttons elsewhere on the site can skip the form.

---

## 8. Legal, trust and compliance (required to sell and to list in directories)

Write clear, plain-English pages. Mark them "Last updated: Oct 24, 2026". Add a visible note at the top of each: "This policy is provided for transparency and is not legal advice; JuryHour will update it as the service evolves." Flag for founder review.

- **Privacy policy:** what we collect from customers (URL, page text, buyer description, email, payment handled by Whop), from jurors (anonymous answers, time spent; identities held by Terac, never shared with customers), processors (Whop, Terac, Exa, Anthropic, Supabase, Vercel, Resend, Cloudflare), retention, deletion requests via support email, cookies/analytics, no sale of data, children (not for under-18s).
- **Terms of service:** service description; results are directional research, not a guarantee; customer warrants they have rights to the page they submit and that it's public; prohibited content list (matches `BANNED_CATEGORIES`); juror anonymity; acceptable use; limitation of liability; governing law placeholder `[STATE]` for founder to fill.
- **Refund policy:** exactly the code rules: full refund if we can't recruit your audience or deliver the minimum panel; pro-rata refund if delivered short; support refunds for late or failed delivery; how to request.
- **Cookie notice:** minimal banner only if non-essential cookies/analytics are set; otherwise a footer note.
- **Accessibility statement** in footer (target WCAG 2.2 AA, contact for issues).

---

## 9. SEO, GEO and sharing

- Canonical domain **https://juryhour.com**. Attach the domain in Vercel; 308-redirect `juryhour.vercel.app` → `juryhour.com` (keep preview deployments working).
- Per-page `metadata`: title (≤60 chars), description (≤155), canonical, Open Graph, Twitter card.
- **OG images** via `@vercel/og`: one template with the tally motif and page title; a verdict-share variant already exists at `/api/og/verdict/[token]` — restyle to match.
- `sitemap.xml` (all public pages + blog + opt-in verdicts), `robots.txt` allowing GPTBot, ClaudeBot, PerplexityBot, Google-Extended; disallow `/o`, `/t`, `/r`, `/ops`, `/preview`, `/styleguide`.
- `llms.txt` and `llms-full.txt` summarizing the product, pricing, method and links.
- JSON-LD: `Organization`, `WebSite`, `Product` + `Offer` per tier (price, currency, availability), `FAQPage` on FAQ blocks, `Article` on blog posts, `BreadcrumbList` on subpages.
- Headings phrased as the questions people ask ("How do I test a landing page with real people?"); answer in the first two sentences of each section.
- Comparison content uses real tables (better cited by AI engines).

---

## 10. Analytics and attribution

- Capture `?src=`, `utm_*`, `?code=` on first visit into a first-party cookie (try/catch; 30 days) and pass to preview + checkout (already supported by the API's `src`).
- Vercel Web Analytics for pageviews + custom events: `preview_started`, `preview_completed`, `preview_refused`, `pricing_viewed`, `tier_clicked {tier}`, `checkout_redirected {tier, code}`, `waitlist_joined`, `share_clicked`. Add PostHog only if `NEXT_PUBLIC_POSTHOG_KEY` is set (free tier); no session replay on `/t` (juror page).
- No PII in analytics payloads.

---

## 11. Quality bar (must pass before each production deploy)

- **Smoke test** (Playwright, mobile + desktop): load `/`, run a preview against a known public page in sandbox mode, see the result, click Proof, reach a Whop checkout URL (sandbox). Load every route in the IA; no 404s, no console errors.
- **Lighthouse (mobile):** Performance ≥ 95, Accessibility = 100, Best Practices ≥ 95, SEO = 100 on `/`, `/pricing`, `/sample-report`.
- **Core Web Vitals:** LCP < 2.0 s on 4G, CLS < 0.05, INP < 200 ms. Fonts via `next/font` with `display: swap`; hero artifact is HTML/SVG, not an image.
- **Accessibility:** WCAG 2.2 AA; keyboard-only path through preview and checkout; visible focus; form labels and errors announced (`aria-live`); color contrast checked in both themes; reduced motion honored.
- **Responsive:** 360, 390, 768, 1024, 1440 widths; no horizontal scroll.
- **Copy review:** every number on the site is either a price, a sourced competitor fact, or a live DB count ≥ 1. No fabricated testimonials, logos or results. "Example" labels on illustrative content.
- **Links:** automated link check across the site.
- **Juror page `/t`:** must remain neutral (no JuryHour marketing, no customer branding leak), fast on mobile, unchanged in behavior.

---

## 12. Parallel subagents (Phases 2–3)

Phase 2 starts only after you (lead) commit the design tokens, layout shell (header/footer), and shared components list. Then spawn subagents with strict file ownership. Shared components live in `src/components/ui/*` and are owned by Agent A; others request changes via `docs/INTEGRATION_NOTES.md`.

| Agent | Owns | Delivers |
|---|---|---|
| **A — Design system** | `src/styles/**`, `src/components/ui/**`, `/styleguide` | Tokens, typography, Button, Input, SegmentedControl, Card, Badge, Tally, VerdictStamp, JurorQuote, Scorecard, PriceCard, CompareTable, FAQ, Banner, Header, Footer, OG template |
| **B — Home + pricing** | `src/app/(site)/page.tsx`, `src/app/(site)/pricing/**`, `src/components/marketing/home/**`, `src/components/pricing/**` | Home sections §5, pricing page, server-rendered prices, launch-offer bar |
| **C — Preview & checkout UX** | `src/components/preview/**`, `src/app/(site)/preview/**`, `src/lib/attribution.ts` | Flow §7, attribution §10, sessionStorage handoff, error/refusal/capacity states |
| **D — Content pages** | `src/app/(site)/{how-it-works,sample-report,for,compare,about,agents,affiliates,contact,changelog,verdicts,faq}/**`, `content/**` | Pages §6 with real copy |
| **E — Legal, SEO, blog** | `src/app/(site)/legal/**`, `src/app/(site)/blog/**`, `src/app/{sitemap,robots}.ts`, `public/llms*.txt`, `src/lib/seo.ts` | §8, §9, MDX blog + first post stub |
| **F — QA** | `tests/e2e/**`, `lighthouserc.*`, `scripts/linkcheck.*` | §11 tests, CI scripts, final report |

Each subagent: read `SPEC.md` and this file, build only its files, run `pnpm typecheck && pnpm lint && pnpm test`, and return a report (done, open questions, screenshots at 390px and 1440px).

---

## 13. Hard rules

**Do:** keep preview and checkout working at every deploy · server-render prices · label examples · use only sourced competitor facts · ship mobile-first · respect reduced motion · keep `/t` neutral · keep business logic untouched.

**Don't:** fake testimonials, counters, logos or results · use partner logos without permission · add gradients/emoji/stock photos · block the page on client-side fetches · send marketing email from the site beyond the existing two follow-ups · index `/o`, `/t`, `/r`, `/ops`, `/preview`.

---

## 14. Report after each phase

```
PHASE <n> — <status>
Deployed: <url>
Changed pages: ...
Lighthouse (mobile, /): P <n> · A <n> · BP <n> · SEO <n>
Smoke test: pass/fail
Open items needing the founder: ...
```

Start with Phase 1 now.
