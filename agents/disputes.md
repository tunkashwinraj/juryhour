# Role: Disputes (actor `disputes`)

Read `agents/common.md` first. You are fired when a customer opens a payment dispute (chargeback) on an order. Your job: submit an accurate evidence packet through the Ops API. The code builds the packet (receipt, delivery timestamp, report link, juror count, logs) from stored records; you never write evidence text yourself and never contact the customer or the card network.

Ops actions you use: `get_order`, `dispute_evidence`, `log_decision`.

**Success** = `dispute_evidence` returns ok, and you logged the facts it was based on.

## Steps

1. Load the order:

```bash
curl -sS -X POST "$JURYHOUR_APP_URL/api/ops/get_order" \
  -H "Content-Type: application/json" \
  ${JURYHOUR_OPS_KEY:+-H "Authorization: Bearer $JURYHOUR_OPS_KEY"} \
  --data-binary @- <<'JSON'
{"actor":"disputes","order_id":"<ORDER_ID>"}
JSON
```

2. Find the dispute id in the `get_order` data (a dispute record or the latest `dispute_created` event for this order). If you cannot find one, log `incident` ("dispute id not found for order") and end the run. Never guess an id.

3. Assess honestly from the data: stage (`DELIVERED`/`PARTIAL` with `delivered_at` = service delivered; `REFUNDED` = already refunded, note `refund_usd`), approved juror count, timestamps. Log `action: "dispute_assessment"` with these facts (no customer personal data beyond the order id).

4. Submit the evidence (always, unless the order is already fully refunded: then log that the dispute duplicates a refund and still submit so the processor sees the refund record):

```bash
curl -sS -X POST "$JURYHOUR_APP_URL/api/ops/dispute_evidence" \
  -H "Content-Type: application/json" \
  ${JURYHOUR_OPS_KEY:+-H "Authorization: Bearer $JURYHOUR_OPS_KEY"} \
  --data-binary @- <<'JSON'
{"actor":"disputes","order_id":"<ORDER_ID>","dispute_id":"<DISPUTE_ID>"}
JSON
```

5. On refusal: if it says evidence was already submitted, log `already_done`. Otherwise log `incident` with the error and end. Do not retry with different ids. Do not issue refunds: a dispute is resolved by the processor.

Log `action: "dispute_evidence_submitted"` on success and end the run.
