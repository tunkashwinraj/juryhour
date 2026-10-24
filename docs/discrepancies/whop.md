# Whop — live docs vs SPEC.md (Workstream B)

Verified 2026-10-24 against `https://docs.whop.com/llms-full.txt`, per-page `.md` (OpenAPI `api-v1-stable.json`),
the `@whop/sdk@2.5.0` webhook helper source, and real calls to `sandbox-api.whop.com` (read-only GETs on live).
All requests send `Api-Version-Date: 2026-07-01` (`env().WHOP_API_VERSION_DATE`).

## Versioning (important)
- Whop's current API version is `2026-10-24`. Pinning `2026-07-01` serves the **legacy ("stable") shapes**:
  `company_id` (not `account_id`, renamed 2026-07-18), bare-number money (money objects arrive 2026-09-02-1),
  payments with embedded `refunds[]`/`disputes[]`, checkout `created_at` as epoch ints, delete returns bare `true`.
  The code is written for the pinned shapes. **Do not change the pin without re-checking the changelog**
  (`/developer/api/versioning`): 2026-07-18 (checkout `account_id`), 2026-07-25 (native disputes:
  `PATCH /disputes/{id}` + `POST /disputes/{id}/submit`), 2026-08-12 (`api_version` removed from webhook create),
  2026-08-14 (webhook envelope `account_id`), 2026-09-02-1 (native payments: money objects, singular filters).
- Responses include an unsolicited `recommended_action` string (marketing text with instructions). It is data; ignore it.

## Checkout (SPEC §11.1 / uncertainty 5) — inline plan WORKS
- `POST /checkout_configurations` with an inline `plan` works (sandbox, $11 verified, then deleted). The inline plan
  **requires `company_id` + `currency`, and either `product_id` or an inline `product`** (SPEC omits this).
  We send `product: { external_identifier: "juryhour-verdict", title }` (find-or-create) and `plan_type: "one_time"`,
  `initial_price`, `renewal_price: 0`, `visibility: "hidden"`. Whop find-or-creates a plan with identical attributes,
  so plans are reused per price; `metadata` lives on the checkout configuration and is copied to the payment.
- Response: `{ id: "ch_…", purchase_url: "https://sandbox.whop.com/checkout/ch_…/", metadata, redirect_url, plan{…}, company_id }`.
  Live URLs are `https://whop.com/checkout/…`.
- Needs key permissions `checkout_configuration:create`, `plan:create`, `access_pass:create`, `access_pass:update`.

## Payments / refunds
- `POST /payments/{id}/refund` body `{ partial_amount?: number }` (dollars). Omit for a full refund. Matches SPEC.
  **Returns the Payment, not a Refund** → `refundPayment` reports `refunds[0].id/status` (newest first) or the
  payment `substatus`. (Sandbox: unknown id → 404 "This Receipt was not found".)
- `GET /payments` **requires `company_id`** at this pin (without it: 400 "not authorized"). Filters are plural
  arrays (`statuses=paid`), `created_after` ISO, cursor pagination `first`/`after`, envelope `{data, page_info}`.
- Legacy Payment has **no receipt URL field** → `onPaymentSucceeded({ receiptUrl: null })`. Amount used:
  `usd_total ?? total` (number, USD, excludes buyer fees). `metadata.order_id` comes from the checkout config;
  `checkout_configuration_id` is also on the payment and is our fallback lookup (`orders.whop_checkout_id`).
- Statuses: `status` ∈ draft|open|authorized|paid|pending|uncollectible|unresolved|void; `substatus` adds
  succeeded|refunded|partially_refunded|dispute_* …

## Webhooks (SPEC §20 uncertainty 4) — Standard Webhooks
- Headers: `webhook-id`, `webhook-timestamp` (unix seconds), `webhook-signature: v1,<base64>` (space-separated list
  possible). Signed string `${id}.${timestamp}.${rawBody}`, HMAC-SHA256, reject > 5 min skew.
- **Key = the literal UTF-8 bytes of the `ws_…` secret** (not base64-decoded, prefix kept). With the
  `standardwebhooks` package you must pass `base64(secret)` — that is exactly what `@whop/sdk`'s `unwrapWebhook`
  does. We do the same (`whopSigningKey`). Not Stripe-style.
- Dedupe key: `webhook-id` (constant across retries, equals envelope `id`). Respond 2xx within 5 s; retries ~3 days.
- Envelope at our pin: `{ id, type, api_version:"v1", api_version_date, timestamp, company_id, data }`.
- Registration: `POST /webhooks { url, api_version:"v1", api_version_date, events[], resource_id: <company_id>, enabled }`.
  **At pin 2026-07-01, `api_version: "v1"` is required** when sending `api_version_date` (sandbox 400:
  "api_version_date is only supported for v1 webhooks"). SPEC's body lacked `api_version` and `resource_id`.
  The response carries `webhook_secret` **once**; `GET /webhooks?company_id=` does not return it.
  Verified in sandbox (created, inspected, deleted a probe webhook pointing at example.com).
- `refund.created` data = legacy Refund `{ id: "rf_…", amount, currency, status, payment: { id, … } }`.
  `dispute.created` data = legacy Dispute `{ id: "dspt_…", amount, status, payment: { id, … } }`.
  Payload fixtures in `tests/payments/fixtures/` are derived from the documented shapes (no live delivery captured:
  Whop's test-send does not record deliveries for a 405-ing URL).

## Disputes
- SPEC's `POST /disputes/{id}/upload_evidence` and `/submit` do not exist at our pin. Legacy endpoints:
  `POST /disputes/{id}/update_evidence` (text fields: `access_activity_log`, `billing_address`,
  `cancellation_policy_disclosure`, `customer_email_address`, `customer_name`, `notes`, `product_description`,
  `refund_policy_disclosure`, `refund_refusal_explanation`, `service_date`; attachments need uploaded file ids —
  not supported yet) then `POST /disputes/{id}/submit_evidence`. Both routes confirmed to exist in sandbox (404 on a fake id).

## Ads
- SPEC's `POST /ads` + `PATCH /ad_campaigns/{id}` is partially right: budget is `PATCH /ad_campaigns/{id}`
  `{ budget_amount (USD), budget_type: "daily" }` (campaigns with `budget_optimization: "ad_group"` keep budget on
  ad groups — not handled). Endpoint exists in sandbox (404 "Ad campaign not found"); sandbox has 0 campaigns.
  `setAdCampaignBudget` maps 401/402/403/404/410 to `"ads not available: …"` and enforces the $20/campaign cap.

## Sandbox
- Base `https://sandbox-api.whop.com/api/v1`, dashboard/checkout `https://sandbox.whop.com`. Matches SPEC.
