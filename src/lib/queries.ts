// Every SQL query the dashboard runs, in one place, so you can read them.
// Each card has a </> button that shows its query.
//
// The app logs in as dashboard_reader, whose search_path is "receiving",
// so we can write  suppliers  instead of  receiving.suppliers.

// ---------------------------------------------------------------- Overview

export const KPI_SQL = `
select
  current_date                                                                           as today,
  -- deliveries and units in the last 7 days (today counts as day 1),
  -- and the 7 days before that, for the trend pill
  count(distinct r.receipt_id) filter (where r.received_on >= current_date - 6)          as deliveries_7d,
  count(distinct r.receipt_id) filter (where r.received_on between current_date - 13
                                                              and current_date - 7)      as deliveries_prev_7d,
  coalesce(sum(rl.qty_received) filter (where r.received_on >= current_date - 6), 0)     as units_7d,
  coalesce(sum(rl.qty_received) filter (where r.received_on between current_date - 13
                                                               and current_date - 7), 0) as units_prev_7d,

  -- damaged units and value received: last 30 days and the 30 before
  coalesce(sum(rl.qty_damaged) filter (where r.received_on >= current_date - 29), 0)     as damaged_30d,
  coalesce(sum(rl.qty_damaged) filter (where r.received_on between current_date - 59
                                                              and current_date - 30), 0) as damaged_prev_30d,
  coalesce(sum(rl.qty_received * pl.unit_cost)
           filter (where r.received_on >= current_date - 29), 0)                         as value_30d,
  coalesce(sum(rl.qty_received * pl.unit_cost)
           filter (where r.received_on between current_date - 59
                                           and current_date - 30), 0)                    as value_prev_30d,

  -- these come from the po_line_status view
  (select count(*) from po_line_status
    where status in ('short', 'over') and last_received_on >= current_date - 29)        as mismatched_lines_30d,
  (select count(*) from po_line_status where status = 'overdue')                         as overdue_lines,
  (select count(*) from po_line_status where status = 'awaiting')                        as awaiting_lines,
  (select count(distinct po_id) from po_line_status
    where status in ('awaiting', 'overdue'))                                             as open_orders,
  -- fill rate on orders already due; least() stops extra units hiding a short line
  (select round(100.0 * sum(least(qty_received, qty_ordered)) / nullif(sum(qty_ordered), 0), 1)
     from po_line_status where expected_on < current_date)                               as fill_rate_pct
from receipts r
join receipt_lines rl on rl.receipt_id = r.receipt_id
join po_lines pl      on pl.po_line_id = rl.po_line_id
`.trim();

export const WEEKLY_UNITS_SQL = `
select w.week_start::date                   as week_start,
       s.supplier_id,
       count(distinct r.receipt_id)         as deliveries,
       coalesce(sum(rl.qty_received), 0)    as units_received
from generate_series(
       date_trunc('week', current_date::timestamp) - interval '11 weeks',
       date_trunc('week', current_date::timestamp),
       interval '1 week'
     ) as w(week_start)                     -- one row per week, even empty ones
cross join suppliers s                      -- ...for every supplier, so the chart can filter
left join purchase_orders po
       on po.supplier_id = s.supplier_id
left join receipts r
       on r.po_id = po.po_id
      and date_trunc('week', r.received_on::timestamp) = w.week_start
left join receipt_lines rl
       on rl.receipt_id = r.receipt_id
group by w.week_start, s.supplier_id
order by w.week_start, s.supplier_id
`.trim();

export const SUPPLIER_VALUE_SQL = `
select s.supplier_id,
       s.name                               as supplier,
       sum(rl.qty_received * pl.unit_cost)  as value_received
from receipts r
join receipt_lines rl   on rl.receipt_id = r.receipt_id
join po_lines pl        on pl.po_line_id = rl.po_line_id
join purchase_orders po on po.po_id = r.po_id
join suppliers s        on s.supplier_id = po.supplier_id
where r.received_on >= date_trunc('week', current_date) - interval '11 weeks'
group by s.supplier_id, s.name
order by value_received desc
`.trim();

// -------------------------------------------------------------- Deliveries

export const DELIVERIES_SQL = `
select r.receipt_id,
       r.received_on,
       po.po_number,
       s.supplier_id,
       s.name                                 as supplier,
       r.packing_slip_no,
       r.received_by,
       r.source,
       count(*)                               as lines,
       sum(rl.qty_received)                   as units,
       sum(rl.qty_damaged)                    as damaged,
       sum(rl.qty_received * pl.unit_cost)    as value
from receipts r
join purchase_orders po on po.po_id = r.po_id
join suppliers s        on s.supplier_id = po.supplier_id
join receipt_lines rl   on rl.receipt_id = r.receipt_id
join po_lines pl        on pl.po_line_id = rl.po_line_id
group by r.receipt_id, po.po_number, s.supplier_id   -- receipt_id is the key, so r.* columns are allowed
order by r.received_on desc, r.receipt_id desc
`.trim();

export const DELIVERY_LINES_SQL = `
select rl.receipt_id,
       v.sku,
       v.product,
       v.qty_ordered,
       rl.qty_received,
       rl.qty_damaged,
       v.status                               -- the order line's status across all deliveries
from receipt_lines rl
join po_line_status v on v.po_line_id = rl.po_line_id
order by rl.receipt_id, v.sku
`.trim();

// --------------------------------------------------------- Purchase orders

export const ORDER_LINES_SQL = `
select po_line_id,
       po_number,
       supplier_id,
       supplier,
       sku,
       product,
       expected_on,
       current_date - expected_on   as days_past_due,
       qty_ordered,
       qty_received,
       qty_damaged,
       status
from po_line_status
order by case status when 'overdue' then 1 when 'short' then 2
                     when 'awaiting' then 3 when 'over' then 4 else 5 end,
         expected_on,
         po_number
`.trim();

// --------------------------------------------------------------- Suppliers

export const SUPPLIER_TOTALS_SQL = `
select s.supplier_id,
       s.name                                         as supplier,
       s.city,
       s.lead_time_days,
       count(distinct po.po_id)                       as orders,
       sum(pl.qty_ordered)                            as units_ordered,
       coalesce(sum(rcv.qty_received), 0)             as units_received,
       -- fill rate: share of ordered units that showed up.
       -- least() stops extra units on one line from hiding a short line.
       round(100.0 * sum(least(coalesce(rcv.qty_received, 0), pl.qty_ordered))
                   / nullif(sum(pl.qty_ordered), 0), 1) as fill_rate_pct,
       coalesce(sum(rcv.qty_received * pl.unit_cost), 0) as value_received
from suppliers s
join purchase_orders po on po.supplier_id = s.supplier_id
join po_lines pl        on pl.po_id = po.po_id
left join (                         -- total received per order line
       select po_line_id, sum(qty_received) as qty_received
       from receipt_lines
       group by po_line_id
     ) rcv                on rcv.po_line_id = pl.po_line_id
where po.expected_on < current_date -- only orders that were already due
group by s.supplier_id, s.name
order by value_received desc
`.trim();

export const SUPPLIER_HEALTH_SQL = `
select supplier_id,
       count(*) filter (where status = 'short')    as short_lines,
       count(*) filter (where status = 'overdue')  as overdue_lines,
       -- on time: the line's last delivery came on or before its expected date
       round(100.0 * count(*) filter (where last_received_on <= expected_on)
                   / nullif(count(*) filter (where last_received_on is not null), 0), 1) as on_time_pct
from po_line_status
group by supplier_id
`.trim();

// -------------------------------------------------------------- Mismatches

export const MISMATCHES_SQL = `
select po_line_id,
       last_received_on,
       po_number,
       supplier_id,
       supplier,
       sku,
       product,
       qty_ordered,
       qty_received,
       qty_difference,
       qty_damaged,
       unit_cost,
       status
from po_line_status
where status in ('short', 'over')
   or qty_damaged > 0
order by last_received_on desc, abs(qty_difference) desc
`.trim();

// Shown by the </> buttons. Keys match the cards.
export const SQL_BY_CARD = {
  kpis: { title: "Number tiles", sql: KPI_SQL },
  weekly: { title: "Units received per week", sql: WEEKLY_UNITS_SQL },
  supplierValue: { title: "Value received by supplier", sql: SUPPLIER_VALUE_SQL },
  deliveries: { title: "Deliveries", sql: DELIVERIES_SQL },
  deliveryLines: { title: "What was on each delivery", sql: DELIVERY_LINES_SQL },
  orders: { title: "Purchase order lines", sql: ORDER_LINES_SQL },
  suppliers: { title: "Supplier totals", sql: SUPPLIER_TOTALS_SQL },
  supplierHealth: { title: "Supplier on-time and problem lines", sql: SUPPLIER_HEALTH_SQL },
  mismatches: { title: "Count mismatches", sql: MISMATCHES_SQL },
} as const;
export type SqlKey = keyof typeof SQL_BY_CARD;
