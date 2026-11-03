// Every SQL query the dashboard runs, in one place, so you can read them.
// The page shows each one under "Show the SQL".
//
// The app logs in as dashboard_reader, whose search_path is "receiving",
// so we can write  suppliers  instead of  receiving.suppliers.

export const KPI_SQL = `
select
  -- deliveries that arrived in the last 7 days (today counts as day 1)
  (select count(*)
     from receipts
    where received_on >= current_date - 6)                        as deliveries_7d,

  -- units counted on those deliveries
  (select coalesce(sum(rl.qty_received), 0)
     from receipt_lines rl
     join receipts r on r.receipt_id = rl.receipt_id
    where r.received_on >= current_date - 6)                      as units_7d,

  -- order lines received in the last 30 days where the count was off
  (select count(*)
     from po_line_status
    where status in ('short', 'over')
      and last_received_on >= current_date - 29)                  as mismatched_lines_30d,

  -- order lines that should have arrived already but have not
  (select count(*)
     from po_line_status
    where status = 'overdue')                                     as overdue_lines
`.trim();

export const SUPPLIER_TOTALS_SQL = `
select s.name                                         as supplier,
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

export const WEEKLY_UNITS_SQL = `
select w.week_start::date                    as week_start,
       coalesce(sum(rl.qty_received), 0)     as units_received
from generate_series(
       date_trunc('week', current_date::timestamp) - interval '11 weeks',
       date_trunc('week', current_date::timestamp),
       interval '1 week'
     ) as w(week_start)                      -- one row per week, even empty ones
left join receipts r
       on date_trunc('week', r.received_on::timestamp) = w.week_start
left join receipt_lines rl
       on rl.receipt_id = r.receipt_id
group by w.week_start
order by w.week_start
`.trim();

export const MISMATCHES_SQL = `
select last_received_on,
       po_number,
       supplier,
       sku,
       product,
       qty_ordered,
       qty_received,
       qty_difference,
       qty_damaged,
       status
from po_line_status
where status in ('short', 'over')
   or qty_damaged > 0
order by last_received_on desc, abs(qty_difference) desc
limit 20
`.trim();
