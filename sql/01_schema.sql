-- =====================================================================
-- 01_schema.sql : the tables for the Receiving Dashboard
-- All data in this project is MADE UP. No real company, supplier or
-- price is used.
--
-- Everything lives in its own schema called "receiving" (a schema is a
-- folder for tables). On Supabase this keeps the tables OUT of the
-- public Data API, which only exposes the "public" schema by default.
-- =====================================================================

drop schema if exists receiving cascade;
create schema receiving;

-- Who we buy from. One row per supplier.
create table receiving.suppliers (
  supplier_id    integer generated always as identity primary key,
  name           text    not null unique,
  city           text    not null,
  lead_time_days integer not null check (lead_time_days between 1 and 60)
);

-- What we buy. Each product comes from one supplier.
create table receiving.products (
  product_id  integer generated always as identity primary key,
  sku         text           not null unique,
  name        text           not null,
  category    text           not null,
  unit        text           not null,            -- "case", "box", "pack" ...
  unit_cost   numeric(10, 2) not null check (unit_cost >= 0),
  supplier_id integer        not null references receiving.suppliers (supplier_id)
);

-- An order we sent to a supplier (the header: who, when).
create table receiving.purchase_orders (
  po_id       integer generated always as identity primary key,
  po_number   text    not null unique,
  supplier_id integer not null references receiving.suppliers (supplier_id),
  ordered_on  date    not null,
  expected_on date    not null,
  check (expected_on >= ordered_on)
);

-- The lines on an order (the detail: which product, how many).
-- unit_cost is copied here because prices change over time; the order
-- keeps the price that was agreed on that day.
create table receiving.po_lines (
  po_line_id  integer generated always as identity primary key,
  po_id       integer        not null references receiving.purchase_orders (po_id) on delete cascade,
  product_id  integer        not null references receiving.products (product_id),
  qty_ordered integer        not null check (qty_ordered > 0),
  unit_cost   numeric(10, 2) not null check (unit_cost >= 0),
  unique (po_id, product_id)
);

-- A delivery that arrived at the dock. One order can arrive in more
-- than one delivery (a "split shipment").
-- source says how the receipt was entered. 'document_reader' is for a
-- future version where receipts come from the Receiving Document Reader
-- project; today every seeded row is 'manual'.
create table receiving.receipts (
  receipt_id      integer generated always as identity primary key,
  po_id           integer not null references receiving.purchase_orders (po_id) on delete cascade,
  received_on     date    not null,
  received_by     text    not null,
  packing_slip_no text,
  source          text    not null default 'manual'
                  check (source in ('manual', 'document_reader'))
);

-- What was actually counted on each delivery, per order line.
create table receiving.receipt_lines (
  receipt_line_id integer generated always as identity primary key,
  receipt_id      integer not null references receiving.receipts (receipt_id) on delete cascade,
  po_line_id      integer not null references receiving.po_lines (po_line_id) on delete cascade,
  qty_received    integer not null check (qty_received >= 0),
  qty_damaged     integer not null default 0 check (qty_damaged >= 0),
  check (qty_damaged <= qty_received),
  unique (receipt_id, po_line_id)
);

-- Indexes on the foreign keys the dashboard joins on most.
create index on receiving.products (supplier_id);
create index on receiving.purchase_orders (supplier_id);
create index on receiving.po_lines (po_id);
create index on receiving.receipts (po_id);
create index on receiving.receipts (received_on);
create index on receiving.receipt_lines (po_line_id);

-- ---------------------------------------------------------------------
-- View: one row per order line, comparing ordered vs. received.
-- A view is a saved query you can select from like a table.
-- ---------------------------------------------------------------------
create view receiving.po_line_status
  with (security_invoker = true)  -- run with the permissions of whoever is asking
as
with received as (
  -- add up every delivery for each order line
  select rl.po_line_id,
         sum(rl.qty_received) as qty_received,
         sum(rl.qty_damaged)  as qty_damaged,
         max(r.received_on)   as last_received_on
  from receiving.receipt_lines rl
  join receiving.receipts r on r.receipt_id = rl.receipt_id
  group by rl.po_line_id
)
select pl.po_line_id,
       po.po_id,
       po.po_number,
       s.supplier_id,
       s.name                                   as supplier,
       p.sku,
       p.name                                   as product,
       p.category,
       po.ordered_on,
       po.expected_on,
       pl.qty_ordered,
       coalesce(rc.qty_received, 0)             as qty_received,
       coalesce(rc.qty_damaged, 0)              as qty_damaged,
       coalesce(rc.qty_received, 0) - pl.qty_ordered as qty_difference,
       pl.unit_cost,
       rc.last_received_on,
       case
         when rc.po_line_id is null and po.expected_on >= current_date then 'awaiting'
         when rc.po_line_id is null                                    then 'overdue'
         when rc.qty_received < pl.qty_ordered                          then 'short'
         when rc.qty_received > pl.qty_ordered                          then 'over'
         else 'complete'
       end                                      as status
from receiving.po_lines pl
join receiving.purchase_orders po on po.po_id = pl.po_id
join receiving.suppliers s       on s.supplier_id = po.supplier_id
join receiving.products p        on p.product_id = pl.product_id
left join received rc            on rc.po_line_id = pl.po_line_id;
