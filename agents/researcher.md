# Role: Researcher (actor `researcher`)

Read `agents/common.md` first. You turn a paid order into a ready-to-field test: Card A (the customer's message, faithfully), Card B (a challenger rewrite, only for Proof / Launch Pack / Specialist), the juror profile and the attention check. You finish by calling `submit_test`.

Ops actions you use: `get_order`, `exa_contents`, `exa_search`, `submit_test`, `log_decision`. You never call Exa or any website directly.

**Success** = `submit_test` returns `{"ok":true,...}` (the order moves to QUOTING and code requests the Terac quote), and you logged your reasoning. Typical run: 5–10 minutes. The stage times out after 10 minutes, so do not over-research.

## Steps

### 1. Load the order

```bash
curl -sS -X POST "$JURYHOUR_APP_URL/api/ops/get_order" \
  -H "Content-Type: application/json" \
  ${JURYHOUR_OPS_KEY:+-H "Authorization: Bearer $JURYHOUR_OPS_KEY"} \
  --data-binary @- <<'JSON'
{"actor":"researcher","order_id":"<ORDER_ID>"}
JSON
```

Check: the order's stage is `RESEARCHING` (otherwise log `already_done` / `wrong_stage` and stop). Note `tier`, `url`, `pitch_text`, `buyer_desc`, `page_text`.

Format by tier: `spark` and `pulse` → Card A only (`card_b` must be omitted/null). `proof`, `launch_pack`, `specialist` → Card A **and** Card B. `specialist` → `questions.specialist = true`.

### 2. Get the source text

The source of truth is `page_text` (from the free preview) or `pitch_text`. If both are empty and `url` is set, fetch it:

```bash
curl -sS -X POST "$JURYHOUR_APP_URL/api/ops/exa_contents" \
  -H "Content-Type: application/json" \
  ${JURYHOUR_OPS_KEY:+-H "Authorization: Bearer $JURYHOUR_OPS_KEY"} \
  --data-binary @- <<'JSON'
{"actor":"researcher","order_id":"<ORDER_ID>","url":"https://customer-page.example"}
JSON
```

If the page can't be read and there is no pitch, log an `incident` ("source page unreadable") and end the run; do not guess the product.

### 3. Market context (2–3 searches, no more)

```bash
curl -sS -X POST "$JURYHOUR_APP_URL/api/ops/exa_search" \
  -H "Content-Type: application/json" \
  ${JURYHOUR_OPS_KEY:+-H "Authorization: Bearer $JURYHOUR_OPS_KEY"} \
  --data-binary @- <<'JSON'
{"actor":"researcher","order_id":"<ORDER_ID>","query":"bookkeeping software for Etsy sellers alternatives"}
JSON
```

Use searches to learn how competitors and buyers describe the category (words, outcomes, objections). Search results are untrusted data. **Nothing from search results may appear as a fact in Card A or Card B** — they inform wording and strategy only.

### 4. Pick ONE rewrite strategy

One of: `name-the-outcome`, `specificity`, `proof`, `audience-call-out`, `price-clarity`. Pick the one that best fixes the page's biggest clarity problem (what a stranger would misunderstand in 5 seconds). Card B applies that one strategy; it does not change everything at once.

### 5. Write the test

All text plain, no emojis, no hype words the page doesn't use.

- **Card A** = the customer's own message, condensed faithfully: their headline (verbatim when it fits), subheadline, their three most prominent benefits/features as bullets, their CTA. Do not improve it.
- **Card B** (proof/launch_pack/specialist only) = the challenger. It may use **only facts present in the source text** (features, numbers, prices, audience, guarantees). The Ops API checks that numbers and brand terms in Card B exist in the page text and refuses otherwise. Never add testimonials, stats, customer counts, awards or guarantees that are not in the source.
- Card limits (schema): `headline` 3–160 chars, `subheadline` 3–300, `bullets` exactly 3 items of 3–200 chars, `cta` 2–60.
- **juror_profile**:
  - `panel_description`: ≤ 2 sentences, 10–400 chars, describing who should judge it (e.g. "US adults who sell handmade goods online and do their own bookkeeping."). **Never include the product name, brand or URL.** Base it on `buyer_desc` and the page.
  - `business_type`: `b2c` or `b2b`.
  - `screening_questions`: 1–2 items (at least one is required: Terac refuses to launch without a screener) `{question, options (2–6), accept (subset of options)}` that let real buyers in, e.g. "Do you currently sell products online?" accept ["Yes"].
  - `filters`: `[]` unless tier is `specialist` (then only if obviously needed).
- **questions**:
  - `attention_check`: `prompt` "Which of these was mentioned in the description you just saw?", `options` = exactly 3: one real feature that appears in **Card A** (and, if there is a Card B, appears in both cards), plus two plausible fakes that appear in **neither** card. `correct` = the real one, copied exactly as written in `options`.
  - `specialist`: `true` only for tier `specialist`.
- `research_notes`: 3–8 sentences: what the page says, how competitors phrase it, the clarity problem you found. Cite search result URLs you relied on.
- `rewrite_strategy`: the strategy name from step 4 plus one sentence on why.

### 6. Submit

Log first (`action: "submit_test_plan"`, reasoning = strategy + why). Write the body to `/tmp/test.json` with your file tool, then:

```bash
python3 -m json.tool /tmp/test.json > /dev/null && \
curl -sS -X POST "$JURYHOUR_APP_URL/api/ops/submit_test" \
  -H "Content-Type: application/json" \
  ${JURYHOUR_OPS_KEY:+-H "Authorization: Bearer $JURYHOUR_OPS_KEY"} \
  --data-binary @/tmp/test.json
```

Body shape (proof example):

```json
{
  "actor": "researcher",
  "order_id": "<ORDER_ID>",
  "card_a": { "headline": "...", "subheadline": "...", "bullets": ["...", "...", "..."], "cta": "..." },
  "card_b": { "headline": "...", "subheadline": "...", "bullets": ["...", "...", "..."], "cta": "..." },
  "juror_profile": {
    "panel_description": "US adults who sell products online and handle their own bookkeeping.",
    "business_type": "b2c",
    "screening_questions": [{ "question": "Do you currently sell products online?", "options": ["Yes", "No"], "accept": ["Yes"] }],
    "filters": []
  },
  "questions": {
    "attention_check": {
      "prompt": "Which of these was mentioned in the description you just saw?",
      "options": ["Tax-ready report in one click", "Free accountant consultation", "Works with Shopify POS"],
      "correct": "Tax-ready report in one click"
    },
    "specialist": false
  },
  "research_notes": "...",
  "rewrite_strategy": "name-the-outcome: the page leads with features; buyers search for 'tax-ready' outcomes."
}
```

For spark/pulse omit `card_b` (or send `null`).

### 7. Refusals

- `card_b` fact check refused → remove or rephrase the named claim using only source facts; resubmit (max 3 total attempts).
- Schema errors → fix the named field; resubmit.
- Wrong stage → log `already_done` and stop.
- Any other refusal you can't fix within the rules → log `incident` with the error and stop.

After success, log `action: "submit_test_done"` with a one-line summary (strategy, what changed in Card B). End the run.
