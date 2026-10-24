-- 0006 — Pricing v3 (founder decision 2026-10). Lead applies this; agents never do.
--   Public plans: Quick Read (spark) $11 · Verdict (proof) $299 launch offer (20 jurors).
--   Retest (retest, new) $59, sold only from a delivered Verdict report.
--   HALF coupon (50% off the first Verdict, until COUPON_HALF_ENDS_AT) is applied in code, not here.
--   Extra jurors: $7 each, 0–20 per order (orders.extra_jurors).
--   Pulse, Launch Pack and Specialist are retired: their prices rows are deleted; orders keep their
--   tier values (the check constraint still allows them for historical rows).

-- orders.tier: allow the new 'retest' tier (inline check from 0001 is named orders_tier_check).
alter table orders drop constraint if exists orders_tier_check;
alter table orders add constraint orders_tier_check
  check (tier in ('spark','pulse','proof','retest','launch_pack','specialist'));

-- Prices (base ± 25% bands). last_changed_at = now() starts the CEO's 24h cooldown.
update prices
   set base_usd = 11, current_usd = 11, min_usd = 8.25, max_usd = 13.75, last_changed_at = now()
 where tier = 'spark';
update prices
   set base_usd = 299, current_usd = 299, min_usd = 224.25, max_usd = 373.75, last_changed_at = now()
 where tier = 'proof';
insert into prices (tier, base_usd, current_usd, min_usd, max_usd) values
  ('retest', 59, 59, 44.25, 73.75)
on conflict (tier) do update
  set base_usd = excluded.base_usd, current_usd = excluded.current_usd,
      min_usd = excluded.min_usd, max_usd = excluded.max_usd;
delete from prices where tier in ('pulse', 'launch_pack', 'specialist');

-- Lookups for retest eligibility ("one retest per parent") and upgrade-credit usage.
create index if not exists orders_parent_order_id_idx on orders (parent_order_id) where parent_order_id is not null;
-- Lookup for HALF ("first Verdict per email + mode").
create index if not exists orders_email_tier_paid_idx on orders (email, mode, tier) where paid_at is not null;

-- Extra jurors bought at checkout ($7 each). Panel size = tier jurors + extra_jurors.
alter table orders add column if not exists extra_jurors int not null default 0;
alter table orders drop constraint if exists orders_extra_jurors_check;
alter table orders add constraint orders_extra_jurors_check check (extra_jurors between 0 and 20);
