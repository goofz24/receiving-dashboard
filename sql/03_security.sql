-- =====================================================================
-- 03_security.sql : a READ-ONLY database user for the dashboard
--
-- The web app never logs in as the owner of the tables. It logs in as
-- "dashboard_reader", which can only read. That matters most for the AI
-- question box: even if the AI wrote a harmful query, this user is not
-- allowed to change or delete anything.
--
-- BEFORE YOU RUN THIS: replace REPLACE_WITH_A_LONG_RANDOM_PASSWORD below
-- with a long random password (letters and numbers only is easiest).
-- The app refuses to start if you leave the placeholder in.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dashboard_reader') then
    create role dashboard_reader login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
  else
    alter role dashboard_reader login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
  end if;
end
$$;

-- Layer 1: permissions. It may look inside the schema and SELECT. Nothing else.
grant usage  on schema receiving to dashboard_reader;
grant select on all tables in schema receiving to dashboard_reader;  -- includes the view

-- Layer 2: every transaction this user starts is read-only by default,
-- and any single query is stopped after 5 seconds.
alter role dashboard_reader set default_transaction_read_only = on;
alter role dashboard_reader set statement_timeout = '5s';
alter role dashboard_reader set search_path = receiving;

-- Layer 3: Row Level Security. If someone later exposed this schema
-- through Supabase's public Data API, the "anon" role would still see
-- nothing, because only dashboard_reader has a policy that lets it read.
alter table receiving.suppliers       enable row level security;
alter table receiving.products        enable row level security;
alter table receiving.purchase_orders enable row level security;
alter table receiving.po_lines        enable row level security;
alter table receiving.receipts        enable row level security;
alter table receiving.receipt_lines   enable row level security;

drop policy if exists reader_can_read on receiving.suppliers;
create policy reader_can_read on receiving.suppliers       for select to dashboard_reader using (true);
drop policy if exists reader_can_read on receiving.products;
create policy reader_can_read on receiving.products        for select to dashboard_reader using (true);
drop policy if exists reader_can_read on receiving.purchase_orders;
create policy reader_can_read on receiving.purchase_orders for select to dashboard_reader using (true);
drop policy if exists reader_can_read on receiving.po_lines;
create policy reader_can_read on receiving.po_lines        for select to dashboard_reader using (true);
drop policy if exists reader_can_read on receiving.receipts;
create policy reader_can_read on receiving.receipts        for select to dashboard_reader using (true);
drop policy if exists reader_can_read on receiving.receipt_lines;
create policy reader_can_read on receiving.receipt_lines   for select to dashboard_reader using (true);
