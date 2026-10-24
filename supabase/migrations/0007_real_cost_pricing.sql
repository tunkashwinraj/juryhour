-- 0007 — Pricing v4: real Terac juror cost (founder decision 2026-10). Lead applies this; agents never do.
--   Terac charges ~$10.50 per juror with a screening question (we always send one). Every price keeps the
--   30% margin floor after Whop's fee (2.7% + $0.30) at the full juror cost cap (enforced in code).
--   Quick Read (spark) $49 · 3 jurors · cap $32.
--   Verdict (proof) $299 launch offer · 15 jurors (min 10) · cap $158 (price row unchanged).
--   Retest (retest) $129 · 8 jurors · cap $84, sold only from a delivered Verdict report.
--   Extra jurors: $16 each, 0–20 per order (+$10.50 each to the cap); enforced in code, no schema change.
--   LAUNCH20 coupon (20% off the first Verdict → $239, until COUPON_LAUNCH20_ENDS_AT) is applied in code,
--   not here, and never combines with the Quick Read upgrade credit.

-- Prices (base ± 25% bands). last_changed_at = now() starts the CEO's 24h cooldown.
update prices
   set base_usd = 49, current_usd = 49, min_usd = 36.75, max_usd = 61.25, last_changed_at = now()
 where tier = 'spark';
insert into prices (tier, base_usd, current_usd, min_usd, max_usd) values
  ('retest', 129, 129, 96.75, 161.25)
on conflict (tier) do update
  set base_usd = excluded.base_usd, current_usd = excluded.current_usd,
      min_usd = excluded.min_usd, max_usd = excluded.max_usd, last_changed_at = now();
-- proof: same $299 and band (224.25–373.75); reset current_usd in case it was moved, because LAUNCH20
-- ($299 → $239) only clears the margin floor at $295 or more.
update prices
   set base_usd = 299, current_usd = 299, min_usd = 224.25, max_usd = 373.75, last_changed_at = now()
 where tier = 'proof';
