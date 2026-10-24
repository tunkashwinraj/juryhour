-- Kill-switch presses on /ops are human interventions that belong to no order.
-- /ops shows: sum(orders.human_interventions) + company_state.human_interventions.
alter table company_state add column human_interventions int not null default 0;
