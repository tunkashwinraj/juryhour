# Website redesign — contracts (lead, frozen for Phases 2–3)

Read with `docs/WEBSITE_SPEC.md` (the brief) and `docs/CONTRACTS.md` (backend contracts, still binding). **Where this file and WEBSITE_SPEC.md differ, this file wins** — these are lead decisions about what's true today.

## 0. Lead decisions (facts the site must reflect)

1. **Launch offer is real and server-enforced.** `src/lib/launch.ts` → `activeLaunchOffer(now?, normalPrices?)` returns `{tier:'proof', priceUsd:99, normalUsd:149, endsAt, code:'TODAY99'}` or `null`. Env: `LAUNCH_OFFER_ENDS_AT` (set to 2026-10-24T22:00:00Z = 6:00pm ET), `LAUNCH_OFFER_PRICE`, `LAUNCH_OFFER_TIER`, `LAUNCH_OFFER_CODE`. `/api/checkout` applies it automatically by time (code not required). UI must also hide/strike the offer client-side once `endsAt` passes (the static shell can be up to a few minutes stale), and show "normally $149" next to $99.
2. **Promo codes are attribution only.** `/api/checkout` now accepts optional `code` (`[A-Za-z0-9_-]{1,40}`), stored as `orders.promo_code`. No code gives a discount (LOVABLE, WHOP, TODAY99 included). Never promise a code discount in copy.
3. **The "second page" add-on is NOT sold** (nothing fulfills it yet). Add-ons on the site: **+5 jurors $15** and **Rush $9** only. Don't render "second page".
4. **Processors (privacy page):** Whop (payments), Terac (juror recruiting + identity), Exa (page reading/research), **OpenAI** (preview, safety screen, answer grading), **Anthropic** (Claude agents: research, report writing, operations), Supabase (database), Vercel (hosting/analytics), Resend (email), Cloudflare (bot check). 
5. **Support email:** `env().NEXT_PUBLIC_SUPPORT_EMAIL` (default `support@juryhour.com`). The inbox may not exist yet — flag in your report; don't claim "handled by our support agent" unless phrased as intent ("we aim to reply same day").
6. **Domain:** `juryhour.com` DNS isn't live yet. Canonical/OG/sitemap URLs must come from `env().NEXT_PUBLIC_APP_URL` (today `https://juryhour.vercel.app`; the lead flips it to `https://juryhour.com` when DNS resolves). The vercel.app→.com redirect is lead-owned (proxy, gated on `CANONICAL_HOST`) — don't build it. **Never redirect `/api/*`** (webhooks and cron call vercel.app).
7. **Honest numbers:** live counters come only from the DB and only `mode='live'` rows; render a counter block only if its value ≥ 1. Today all are 0 → hidden. Illustrative content is labeled "Example".
8. **Fonts (next/font/google, self-hosted at build):** Display **Newsreader** (H1/H2 only), body/UI **IBM Plex Sans**, utility/data **IBM Plex Mono**.
9. **No new npm packages** except what's installed (`@next/mdx`, `@mdx-js/*`, `@types/mdx`, `@vercel/analytics` are installed; `next/og` is built in). Need one? Request it in `docs/INTEGRATION_NOTES.md`.
10. Next.js 16.4 with `cacheComponents: true`. Read `node_modules/next/dist/docs/01-app/01-getting-started/{03-layouts-and-pages,05-server-and-client-components,08-caching,13-fonts,14-metadata-and-og-images}.md` before writing pages. Per-request DB reads must be inside `<Suspense>` or in `"use cache"` functions (see `getShellPrices` in `src/lib/queries.ts`: `"use cache"` + `cacheLife("minutes")` + `cacheTag(...)`). Static marketing pages should be fully static.
11. Package manager **npm**. Checks: `npx tsc --noEmit`, `npx eslint <your files>`, `npx vitest run tests/<yours>`. Don't run `next build`/`next dev` (shared `.next`; lead builds). Don't `git commit`.

## 1. Routes and layout

- Marketing pages live in the route group **`src/app/(site)/`** with `src/app/(site)/layout.tsx` (lead-owned) rendering: `<LaunchOfferBar />` (B) → `<SiteHeader />` (A) → `<PreviewProvider>{children}</PreviewProvider>` (C) → `<SiteFooter />` (A).
- `/o/[token]`, `/r/[token]`, `/ops`, `/t/[testId]` stay outside the group (no marketing chrome). `/t` must stay neutral and unchanged in behavior.
- Root `src/app/layout.tsx` (A): fonts, `<Analytics />`, global CSS, default metadata via `@/lib/seo`.

## 2. Component contracts

### A — `src/components/ui/*` (design system; import from `@/components/ui`)
Export from `src/components/ui/index.ts`:
```ts
Button(props: { variant?: "primary"|"secondary"|"ghost"|"link"; size?: "sm"|"md"|"lg"; href?: string; full?: boolean } & ButtonHTMLAttributes) // renders <a> when href
Field(props: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode })
Input, Textarea   // styled native elements, forward refs, aria-invalid support
SegmentedControl<T extends string>(props: { options: {value: T; label: ReactNode}[]; value: T; onChange(v: T): void; ariaLabel: string; idPrefix: string }) // role=tablist, arrow keys
Card(props: { as?: ElementType; tone?: "plain"|"raised"; children })
Badge(props: { tone?: "neutral"|"verdict"|"signal"|"sandbox"; children })
Tally(props: { total: number; filled: number; label: string; animate?: boolean })   // 15 marks, signature graphic, honors reduced motion
VerdictStamp(props: { children: ReactNode })     // rotated label, use sparingly
JurorQuote(props: { juror: number | string; children: ReactNode; cite?: ReactNode }) // "Juror 06" mono label
CaseHeader(props: { caseNo: string; tier: string; jurors: number; delivered?: string })
Scorecard(props: { rows: { label: string; a: string; b?: string | null; better?: "a"|"b"|null }[]; labels?: { a: string; b: string } })
PriceCard(props: { name: string; price: number | null; priceNote?: ReactNode /* e.g. "from" */; compareAt?: number | null; jurors?: number | null; summary: string; bullets: string[]; badge?: ReactNode; emphasized?: boolean; cta: ReactNode; footnote?: ReactNode })
CompareTable(props: { caption: string; columns: string[]; rows: { label: string; cells: ReactNode[] }[]; highlightColumn?: number; footnote?: ReactNode })
FAQ(props: { items: { q: string; a: ReactNode; aText: string }[]; headingLevel?: 2|3 }) // aText = plain text for JSON-LD
Banner(props: { tone?: "info"|"warn"|"verdict"; children })
TimerBar(props: { seconds: number; label: string })   // 5-second motif, reduced-motion safe
Section(props: { id?: string; eyebrow?: string; title?: ReactNode; lede?: ReactNode; children })   // 1200px container + vertical rhythm
Container, Eyebrow (mono small caps)
SiteHeader()  // nav per WEBSITE_SPEC §4 (desktop + mobile sheet), "Get a free preview" → "/#preview"
SiteFooter()  // §5.12 columns + accessibility statement link
```
Also A: `src/styles/tokens.css` (all tokens, light + dark), `src/styles/fonts.ts`, `src/app/globals.css` (base + map the old variables `--accent`, `--ink-2`, etc. to new tokens so `/o`, `/r`, `/ops` restyle "with tokens only"), `src/app/(site)/styleguide/page.tsx` (noindex), OG template `src/components/ui/og.tsx` exporting `ogImage({ title, eyebrow?, tally?: {filled,total} })` → JSX for `ImageResponse`, plus `src/app/api/og/route.tsx` (`GET /api/og?title=&eyebrow=`), and restyle `src/app/api/og/verdict/[token]/route.tsx` to match.

### B — home + pricing
```ts
// src/components/marketing/LaunchOfferBar.tsx  (server; renders null when no active offer; client guard hides after endsAt)
LaunchOfferBar()
// src/components/pricing/PricingSection.tsx  (server; prices via getShellPrices + activeLaunchOffer; renders PriceCard ×5 + add-ons + upgrade-credit line)
PricingSection(props: { highlight?: TierName; compact?: boolean; headingLevel?: 2|3 })
// src/lib/marketing-data.ts  ("use cache" + cacheLife("minutes") + cacheTag("counters"))
getLiveCounters(): Promise<{ verdictsDelivered: number; peopleHeard: number; avgDeliveryMinutes: number | null }>  // live mode only
```
Home `src/app/(site)/page.tsx` per §5 (uses C's `HeroPreview` and `TierCta`), pricing page `src/app/(site)/pricing/page.tsx`.

### C — preview & checkout UX (client)
```ts
// src/components/preview/PreviewProvider.tsx  ("use client"; context + sessionStorage handoff of the last preview; holds selected tier)
PreviewProvider(props: { children })
usePreview(): { preview: StoredPreview | null; openForm(opts?: { tier?: BuyableTier; mode?: "url"|"pitch" }): void; ... }
// src/components/preview/HeroPreview.tsx — quick URL input → expands into the full form inline (§7), result/refusal/error views, upsell tier cards
HeroPreview(props: { id?: string /* anchor, default "preview" */; variant?: "hero"|"band" })
// src/components/preview/TierCta.tsx — the ONLY way any page starts a checkout
TierCta(props: { tier: "spark"|"pulse"|"proof"|"launch_pack"|"specialist"; label?: string; variant?: "primary"|"secondary" })
   // no preview yet → scrolls to /#preview (or opens the form in place) with tier preselected; has preview → POST /api/checkout {tier, addons, preview data, code, src} → window.location = purchase_url; specialist → quote request
   // sales paused (503 sales_paused) → becomes "Join the waitlist" (WaitlistForm)
WaitlistForm(), OrderLookupForm(), AgencyOfferForm()   // post to C's /api/leads and /api/order-lookup
// src/lib/attribution.ts — first-visit capture of src / utm_* / code into cookie "jh_attr" (30 days, try/catch); getAttribution(); track(event, props) wrapper over @vercel/analytics `track` (no PII)
```
Routes (C): `POST /api/leads` `{kind:'waitlist'|'agency_offer', email, payload?, src?}` → inserts `leads` (rate-limit by ip_hash, 5/day); `POST /api/order-lookup` `{email}` → if orders exist for that email, sends ONE email with their status links (new template `order_lookup` in `src/emails/templates.ts`, sent via `sendEmail`; rate-limit 3/email/day; always answers the same "If we have orders for that email, we've sent the links" to avoid leaking who's a customer). `src/app/(site)/preview/[id]/page.tsx` (noindex): shows a stored preview by id (only fields from `previews`; refused previews show the refusal).

### D — content pages
`src/app/(site)/{how-it-works,sample-report,for,compare,about,agents,affiliates,contact,changelog,verdicts,faq}/**`, `content/**`, and `src/components/report/**` (may add a `sample` mode to `ReportView` that hides share/next-step CTAs; `/r` behavior must not change).

### E — legal, SEO, blog
`src/app/(site)/legal/**`, `src/app/(site)/blog/**`, `content/blog/**`, `src/app/sitemap.ts`, `src/app/robots.ts`, `public/llms.txt`, `public/llms-full.txt`, `src/lib/seo.ts`, `src/mdx-components.tsx`.
```ts
// src/lib/seo.ts — everyone imports these
pageMetadata(i: { title: string; description: string; path: string; ogTitle?: string; noindex?: boolean }): Metadata  // canonical from NEXT_PUBLIC_APP_URL, OG image /api/og?title=…
JsonLd(props: { data: object | object[] })   // <script type="application/ld+json">
organizationLd(), websiteLd(), productOffersLd(prices, offer), faqLd(items: {q: string; aText: string}[]), articleLd(i), breadcrumbLd(items: {name: string; path: string}[])
```

## 3. Ownership summary
A `src/styles/**`, `src/components/ui/**`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(site)/styleguide/**`, `src/app/api/og/**`, `src/components/SiteHeader.tsx` (keep its exports working for /o /r /ops) · B `src/app/(site)/page.tsx`, `src/app/(site)/pricing/**`, `src/components/marketing/**`, `src/components/pricing/**`, `src/lib/marketing-data.ts` · C `src/components/preview/**`, `src/components/landing/**` (retire it once replaced), `src/app/(site)/preview/**`, `src/lib/attribution.ts`, `src/app/api/leads/**`, `src/app/api/order-lookup/**`, `src/emails/templates.ts` (add `order_lookup` only), `src/lib/email.ts` (register the template only) · D as above · E as above · Lead: everything else (`(site)/layout.tsx`, `next.config.ts`, `src/proxy.ts`, `src/lib/launch.ts`, `/api/*` business logic, migrations, env).
Tests: `tests/website/<letter>/**` per agent.
