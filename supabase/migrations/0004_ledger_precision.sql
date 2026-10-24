-- Per-call AI/Exa costs are fractions of a cent; 2 dp rounded them to $0.00.
alter table ledger alter column amount_usd type numeric(12,4);
