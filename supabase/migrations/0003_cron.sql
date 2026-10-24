-- 0003_cron.sql — pg_cron + pg_net call POST /api/reconcile every minute (SPEC §14).
-- Owner: Workstream E. Applied by the lead (npm run db:migrate). No secrets in this file.
--
-- ONE-TIME SETUP (lead, out-of-band, in the Supabase SQL editor; never commit the values):
--
--   select vault.create_secret('https://<app-host>/api/reconcile', 'reconcile_url',
--                              'JuryHour reconciler endpoint');
--   select vault.create_secret('<INTERNAL_CRON_SECRET value>', 'internal_cron_secret',
--                              'Bearer token for /api/reconcile');
--
-- To rotate / change later:
--   select vault.update_secret((select id from vault.secrets where name = 'internal_cron_secret'), '<new value>');
--   select vault.update_secret((select id from vault.secrets where name = 'reconcile_url'), 'https://<new-host>/api/reconcile');
--
-- Check it runs:
--   select * from cron.job where jobname = 'jh-reconcile';
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--   select status_code, content::text, created from net._http_response order by created desc limit 10;
--
-- Until both secrets exist the job is a no-op (it raises a NOTICE and sends nothing).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Reads the URL and bearer secret from Vault at call time, then fires an async HTTP POST via pg_net.
create or replace function public.jh_invoke_reconcile()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'reconcile_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'internal_cron_secret' limit 1;
  if v_url is null or v_secret is null then
    raise notice 'jh_invoke_reconcile: vault secrets reconcile_url / internal_cron_secret are not set; skipping';
    return null;
  end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.jh_invoke_reconcile() from public;
revoke all on function public.jh_invoke_reconcile() from anon, authenticated;

-- (Re)schedule idempotently.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'jh-reconcile') then
    perform cron.unschedule('jh-reconcile');
  end if;
  if exists (select 1 from cron.job where jobname = 'jh-cron-cleanup') then
    perform cron.unschedule('jh-cron-cleanup');
  end if;
end $$;

select cron.schedule('jh-reconcile', '* * * * *', $cron$ select public.jh_invoke_reconcile(); $cron$);

-- Keep cron/pg_net bookkeeping small (one row per minute otherwise grows forever).
select cron.schedule(
  'jh-cron-cleanup',
  '17 3 * * *',
  $cron$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $cron$
);
