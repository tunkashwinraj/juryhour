-- JuryHour schema (SPEC §6). Frozen contract: only the lead changes this file.
-- Deviations from SPEC §6 are listed in docs/CONTRACTS.md ("Schema notes").

create extension if not exists pgcrypto;

create type order_stage as enum (
  'CREATED','PAID','RESEARCHING','QUOTING','PANEL_LIVE','GRADING',
  'SYNTHESIZING','DELIVERED','PARTIAL','REFUNDED','FAILED','BLOCKED'
);
create type run_mode as enum ('live','sandbox');

create table previews (
  id uuid primary key default gen_random_uuid(),
  email text, url text, pitch_text text, buyer_desc text,
  page_text text, headline text, weakest_line text, rewrite_suggestion text,
  recommended_panel text,
  safety_verdict text not null check (safety_verdict in ('allow','refuse')),
  safety_reason text, src text, ip_hash text,
  followup_1_sent_at timestamptz, followup_2_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index previews_email_idx on previews (email);
create index previews_ip_hash_idx on previews (ip_hash);
create index previews_created_at_idx on previews (created_at);
create index previews_src_idx on previews (src);

create table orders (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,                 -- customer private link token (32 bytes url-safe)
  mode run_mode not null,
  stage order_stage not null default 'CREATED',
  tier text not null check (tier in ('spark','pulse','proof','launch_pack','specialist')),
  addons jsonb not null default '[]',
  price_usd numeric(12,2),                    -- null only for an unpriced specialist quote
  email text not null, url text, pitch_text text, buyer_desc text not null,
  src text,
  preview_id uuid references previews(id),
  parent_order_id uuid references orders(id), -- upgrades / retests
  whop_checkout_id text, whop_payment_id text unique, whop_receipt_url text,
  paid_at timestamptz, delivered_at timestamptz, deadline_at timestamptz,
  quote_expires_at timestamptz,               -- specialist quotes (48h)
  stage_entered_at timestamptz not null default now(),
  attempts int not null default 0,
  refund_usd numeric(12,2) not null default 0,
  support_refund_used boolean not null default false,
  retest_available boolean not null default false, -- launch_pack
  report jsonb,                               -- validated Report (src/lib/types.ts)
  report_public boolean not null default false,    -- customer opted in to public share card
  human_interventions int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_stage_idx on orders (stage);
create index orders_mode_idx on orders (mode);
create index orders_email_idx on orders (email);
create index orders_preview_id_idx on orders (preview_id);
create index orders_parent_order_id_idx on orders (parent_order_id);
create index orders_created_at_idx on orders (created_at);
create index orders_stage_entered_at_idx on orders (stage_entered_at);

create table tests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  card_a jsonb not null,        -- Card
  card_b jsonb,                 -- null for spark/pulse
  format text not null check (format in ('spark','pulse','proof','specialist')),
  juror_profile jsonb not null, -- JurorProfile
  questions jsonb not null,     -- Questions (attention check answer stays server-side)
  research_notes text,
  rewrite_strategy text,
  created_at timestamptz not null default now()
);
create index tests_created_at_idx on tests (created_at);

create table panels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  test_id uuid not null references tests(id),
  mode run_mode not null,
  terac_feasibility_id text, terac_opportunity_id text unique,
  requested_n int not null, approved_n int not null default 0, rejected_n int not null default 0,
  cost_per_participant numeric(12,2), budget_usd numeric(12,2),
  status text not null default 'quoting'
    check (status in ('quoting','priced','live','stopped','infeasible')),
  audience_broadened boolean not null default false,
  launched_at timestamptz, stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create index panels_order_id_idx on panels (order_id);
create index panels_test_id_idx on panels (test_id);
create index panels_status_idx on panels (status);
create index panels_created_at_idx on panels (created_at);
-- exactly one live panel per order
create unique index panels_one_live_per_order on panels (order_id) where status = 'live';

create table responses (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id),
  panel_id uuid not null references panels(id),
  terac_submission_id text unique not null,
  first_card text not null check (first_card in ('A','B')),
  answers jsonb not null,          -- Answers
  seconds_spent int not null,
  attention_passed boolean not null,
  quality_score numeric(4,2), quality_reason text,
  understood_a boolean, understood_b boolean, grader_flags jsonb,
  decision text check (decision in ('approved','rejected','pending')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index responses_test_id_idx on responses (test_id);
create index responses_panel_id_idx on responses (panel_id);
create index responses_decision_idx on responses (decision);
create index responses_created_at_idx on responses (created_at);

create table ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  mode run_mode not null,
  kind text not null check (kind in
    ('revenue','refund','terac_cost','ai_cost','exa_cost','whop_fee','affiliate','ads')),
  amount_usd numeric(12,2) not null,  -- positive revenue, negative costs
  ref text, note text,
  created_at timestamptz not null default now()
);
create index ledger_order_id_idx on ledger (order_id);
create index ledger_kind_idx on ledger (kind);
create index ledger_mode_idx on ledger (mode);
create index ledger_created_at_idx on ledger (created_at);
-- webhook replays must not double-book: one row per (kind, ref) when ref is set
create unique index ledger_kind_ref_uniq on ledger (kind, ref) where ref is not null;

create table events (                 -- agent decision log shown to judges
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  actor text not null check (actor in
    ('researcher','analyst','procurement','quality','ceo','growth','cfo','support','disputes','code')),
  action text not null,
  reasoning text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index events_order_id_idx on events (order_id);
create index events_actor_idx on events (actor);
create index events_created_at_idx on events (created_at);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  kind text not null, detail text, resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index incidents_order_id_idx on incidents (order_id);
create index incidents_resolved_idx on incidents (resolved);
create index incidents_created_at_idx on incidents (created_at);

create table prices (                 -- adjustable by CEO within bands
  tier text primary key,
  base_usd numeric(12,2) not null, current_usd numeric(12,2) not null,
  min_usd numeric(12,2) not null, max_usd numeric(12,2) not null,
  last_changed_at timestamptz
);

create table agent_runs (             -- one row per Claude Code scheduled-task fire
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  agent text not null,
  session_id text unique,             -- claude_code_session_id from /fire
  session_url text,
  status text not null check (status in ('fired','completed','failed','timed_out')),
  attempt int not null default 1,
  started_at timestamptz not null default now(), ended_at timestamptz
);
create index agent_runs_order_id_idx on agent_runs (order_id);
create index agent_runs_status_idx on agent_runs (status);
create index agent_runs_started_at_idx on agent_runs (started_at);

create table processed_webhooks (     -- idempotency
  provider text not null, event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table email_suppressions (     -- unsubscribed addresses (marketing templates only)
  email text primary key,
  created_at timestamptz not null default now()
);

create table company_state (          -- single row
  id int primary key default 1 check (id = 1),
  sales_paused boolean not null default false, pause_reason text,
  terac_balance_usd numeric(12,2), terac_balance_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- Stats: the ONLY source of numbers in reports ----------
-- Approved responses with a stable anonymous label (Juror 1..N by submission time).
create view approved_responses as
select r.*,
       row_number() over (partition by r.test_id order by r.created_at, r.id)::int as juror_number
from responses r
where r.decision = 'approved';

create view order_stats as
select
  t.id as test_id,
  t.order_id,
  count(ar.id)::int as n_approved,
  count(*) filter (where ar.answers->>'preferred' = 'A')::int as prefer_a,
  count(*) filter (where ar.answers->>'preferred' = 'B')::int as prefer_b,
  round(avg((ar.answers->'cards'->'A'->>'clarity')::numeric), 2) as clarity_a,
  round(avg((ar.answers->'cards'->'B'->>'clarity')::numeric), 2) as clarity_b,
  round(avg((ar.answers->'cards'->'A'->>'would_try')::numeric), 2) as intent_a,
  round(avg((ar.answers->'cards'->'B'->>'would_try')::numeric), 2) as intent_b,
  round(avg(case when ar.understood_a then 1 else 0 end)
        filter (where ar.understood_a is not null)::numeric, 2) as understanding_rate_a,
  round(avg(case when ar.understood_b then 1 else 0 end)
        filter (where ar.understood_b is not null)::numeric, 2) as understanding_rate_b
from tests t
left join approved_responses ar on ar.test_id = t.id
group by t.id, t.order_id;

-- ---------- updated_at ----------
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

-- ---------- Security: RLS on everything, service role only ----------
alter table previews enable row level security;
alter table orders enable row level security;
alter table tests enable row level security;
alter table panels enable row level security;
alter table responses enable row level security;
alter table ledger enable row level security;
alter table events enable row level security;
alter table incidents enable row level security;
alter table prices enable row level security;
alter table agent_runs enable row level security;
alter table processed_webhooks enable row level security;
alter table email_suppressions enable row level security;
alter table company_state enable row level security;
alter view approved_responses set (security_invoker = true);
alter view order_stats set (security_invoker = true);

-- Safe projection for the customer status page; the only anon-callable entry point.
create function get_order_by_token(p_token text)
returns table (
  token text, mode run_mode, stage order_stage, tier text, price_usd numeric,
  paid_at timestamptz, delivered_at timestamptz, deadline_at timestamptz,
  refund_usd numeric, requested_n int, approved_n int, has_report boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select o.token, o.mode, o.stage, o.tier, o.price_usd, o.paid_at, o.delivered_at,
         o.deadline_at, o.refund_usd, p.requested_n, coalesce(p.approved_n, 0),
         o.report is not null, o.created_at
  from orders o
  left join lateral (
    select requested_n, approved_n from panels
    where panels.order_id = o.id order by created_at desc limit 1
  ) p on true
  where o.token = p_token and length(p_token) >= 32
$$;
revoke all on function get_order_by_token(text) from public;
grant execute on function get_order_by_token(text) to anon, authenticated;

-- ---------- Seed ----------
insert into prices (tier, base_usd, current_usd, min_usd, max_usd) values
  ('spark',        11,  11,   8.25,  13.75),
  ('pulse',        49,  49,  36.75,  61.25),
  ('proof',       149, 149, 111.75, 186.25),
  ('launch_pack', 199, 199, 149.25, 248.75);
insert into company_state (id) values (1);
