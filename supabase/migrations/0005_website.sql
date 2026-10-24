-- Website redesign (docs/WEBSITE_SPEC.md): lead capture + promo code attribution.

-- Waitlist (sales paused), agency "free Proof" offer, order-lookup requests.
create table leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('waitlist', 'agency_offer', 'order_lookup')),
  email text not null,
  payload jsonb not null default '{}',
  src text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index leads_kind_idx on leads (kind);
create index leads_email_idx on leads (email);
create index leads_created_at_idx on leads (created_at);
alter table leads enable row level security;

alter table orders add column promo_code text;
create index orders_promo_code_idx on orders (promo_code);
