// Every SQL query the IT asset pages run, in one place, so you can read them.
// The tables are in the "itam" schema (sql/04_itam_schema.sql). We write
// itam.asset_current instead of just asset_current so each query says
// exactly where its data comes from.
//
// Most queries read the two views:
//   itam.asset_current  one row per device, status worked out from its latest event
//   itam.device_health  the newest health check for each deployed laptop and desktop

// Devices that still count: not retired, disposed or lost.
const IN_USE = `status in ('deployed', 'in_stock', 'in_repair')`;

// ---------------------------------------------------------------- IT overview

export const IT_KPI_SQL = `
select
  count(*) filter (where status not in ('retired', 'disposed', 'lost'))           as active_assets,
  count(*) filter (where status = 'deployed')                                      as deployed,
  count(*) filter (where status = 'in_stock')                                      as in_stock,
  count(*) filter (where status = 'in_repair')                                     as in_repair,
  count(*) filter (where status = 'ordered')                                       as on_order,
  coalesce(sum(purchase_cost) filter (where ${IN_USE}), 0)                         as value_in_use,
  -- warranty ends in the next 90 days
  count(*) filter (where ${IN_USE} and warranty_days_left between 0 and 90)        as warranty_ending_90d,
  -- older than the model's useful life
  count(*) filter (where ${IN_USE} and refresh_due_on <= current_date)             as past_useful_life,
  -- still out with someone who has left the company
  count(*) filter (where status = 'deployed' and owner_left_on is not null)        as with_leavers,
  -- a laptop, phone or tablet handed out with no person written down
  count(*) filter (where status = 'deployed' and employee_id is null
                     and category in ('laptop', 'phone', 'tablet'))                as personal_no_owner,
  (select count(*) from itam.device_health where bitlocker_on = false)             as bitlocker_off,
  (select count(*) from itam.device_health
    where checked_on is null or days_since_check > 30)                             as not_checked_30d
from itam.asset_current
`.trim();

export const STATUS_BY_CATEGORY_SQL = `
select category,
       status,
       count(*) as assets
from itam.asset_current
group by category, status
order by category, status
`.trim();

export const OFFBOARDING_SQL = `
-- people who left but still have a device or a paid software seat
with devices as (
  select employee_id,
         count(*)                                                       as devices,
         string_agg(asset_tag || ' ' || manufacturer || ' ' || model_name, '; ' order by asset_tag) as device_list,
         sum(purchase_cost)                                             as device_value
  from itam.asset_current
  where status = 'deployed' and owner_left_on is not null
  group by employee_id
),
seats as (
  select ls.employee_id,
         count(*)                                       as seats,
         string_agg(l.product, '; ' order by l.product) as seat_list,
         sum(l.cost_per_seat_year)                      as seat_cost_per_year
  from itam.license_seats ls
  join itam.licenses l  on l.license_id = ls.license_id
  join itam.employees e on e.employee_id = ls.employee_id
  where e.left_on is not null
  group by ls.employee_id
)
select e.employee_id,
       e.full_name,
       e.email,
       e.department,
       e.title,
       e.left_on,
       current_date - e.left_on              as days_since_left,
       coalesce(d.devices, 0)                as devices,
       d.device_list,
       coalesce(d.device_value, 0)           as device_value,
       coalesce(s.seats, 0)                  as seats,
       s.seat_list,
       coalesce(s.seat_cost_per_year, 0)     as seat_cost_per_year
from itam.employees e
left join devices d on d.employee_id = e.employee_id
left join seats s   on s.employee_id = e.employee_id
where e.left_on is not null
  and (d.devices is not null or s.seats is not null)
order by e.left_on desc
`.trim();

export const NEW_HIRES_SQL = `
-- people who started in the last 30 days, and what they have so far
select e.employee_id,
       e.full_name,
       e.department,
       e.title,
       e.started_on,
       current_date - e.started_on                         as days_since_start,
       count(ac.asset_id)                                  as devices,
       count(ac.asset_id) filter (where ac.category = 'laptop') as laptops,
       string_agg(ac.asset_tag, ', ' order by ac.asset_tag) as device_list
from itam.employees e
left join itam.asset_current ac
       on ac.employee_id = e.employee_id
      and ac.status = 'deployed'
where e.left_on is null
  and e.started_on >= current_date - 30
group by e.employee_id
order by e.started_on desc
`.trim();

// --------------------------------------------------------------------- Assets

export const ASSETS_SQL = `
select asset_id,
       asset_tag,
       serial_number,
       category,
       manufacturer,
       model_name,
       status,
       status_since,
       assigned_to,
       department,
       owner_left_on,
       location,
       purchased_on,
       purchase_cost,
       warranty_ends_on,
       warranty_days_left,
       refresh_due_on,
       age_months,
       vendor,
       invoice_number
from itam.asset_current
order by case status when 'in_repair' then 1 when 'deployed' then 2 when 'in_stock' then 3
                     when 'ordered' then 4 when 'lost' then 5 when 'retired' then 6 else 7 end,
         asset_tag
`.trim();

export const ASSET_EVENTS_SQL = `
-- the full history of every device, oldest first
select ev.asset_id,
       ev.event_id,
       ev.event_on,
       ev.event_type,
       e.full_name   as employee,
       ev.done_by,
       ev.note
from itam.asset_events ev
left join itam.employees e on e.employee_id = ev.employee_id
order by ev.asset_id, ev.event_on, ev.event_id
`.trim();

// -------------------------------------------------------- Warranty & refresh

export const WARRANTY_SQL = `
select asset_id,
       asset_tag,
       category,
       manufacturer,
       model_name,
       status,
       assigned_to,
       location,
       purchased_on,
       purchase_cost,
       warranty_ends_on,
       warranty_days_left,
       refresh_due_on,
       refresh_due_on - current_date  as refresh_days_left,
       age_months,
       useful_life_months
from itam.asset_current
where ${IN_USE}
  and (warranty_days_left <= 90 or refresh_due_on <= current_date + 365)
order by warranty_days_left
`.trim();

export const REFRESH_PLAN_SQL = `
-- devices that reach the end of their useful life, by quarter, for budgeting.
-- generate_series makes one row per quarter, so empty quarters still show.
with quarters as (
  select q::date as quarter_start
  from generate_series(date_trunc('quarter', current_date::timestamp),
                       date_trunc('quarter', current_date::timestamp) + interval '9 months',
                       interval '3 months') as q
)
select 'Overdue'                         as bucket,
       null::date                        as quarter_start,
       count(*)                          as assets,
       coalesce(sum(purchase_cost), 0)   as replacement_cost
from itam.asset_current
where ${IN_USE} and refresh_due_on < date_trunc('quarter', current_date)
union all
select to_char(qt.quarter_start, 'YYYY "Q"Q'),
       qt.quarter_start,
       count(ac.asset_id),
       coalesce(sum(ac.purchase_cost), 0)
from quarters qt
left join itam.asset_current ac
       on ac.status in ('deployed', 'in_stock', 'in_repair')
      and date_trunc('quarter', ac.refresh_due_on) = qt.quarter_start
group by qt.quarter_start
order by quarter_start nulls first
`.trim();

// ---------------------------------------------------------------- Device health

export const DEVICE_HEALTH_SQL = `
select asset_id,
       asset_tag,
       category,
       manufacturer,
       model_name,
       assigned_to,
       department,
       checked_on,
       days_since_check,
       os_version,
       bitlocker_on,
       disk_free_pct,
       pending_updates,
       -- one flag per problem, so the page can filter and count them
       (bitlocker_on = false)                           as flag_bitlocker,
       (disk_free_pct < 15)                             as flag_low_disk,
       (pending_updates > 5)                            as flag_updates,
       (checked_on is null or days_since_check > 30)    as flag_not_checked
from itam.device_health
order by (bitlocker_on = false) desc nulls last,
         (checked_on is null or days_since_check > 30) desc,
         disk_free_pct nulls first,
         asset_tag
`.trim();

// ------------------------------------------------------------------- Licenses

export const LICENSES_SQL = `
select l.license_id,
       l.product,
       l.vendor,
       l.seats_owned,
       count(ls.employee_id)                                     as seats_used,
       count(ls.employee_id) filter (where e.left_on is not null) as seats_with_leavers,
       l.seats_owned - count(ls.employee_id)                     as seats_free,   -- below 0 = more users than seats
       l.cost_per_seat_year,
       l.seats_owned * l.cost_per_seat_year                      as cost_per_year,
       -- paying for seats nobody should have: free seats + seats people who left still hold
       (greatest(l.seats_owned - count(ls.employee_id), 0)
        + count(ls.employee_id) filter (where e.left_on is not null)) * l.cost_per_seat_year as waste_per_year,
       l.renews_on,
       l.renews_on - current_date                                as renews_in_days
from itam.licenses l
left join itam.license_seats ls on ls.license_id = l.license_id
left join itam.employees e      on e.employee_id = ls.employee_id
group by l.license_id
order by l.renews_on
`.trim();

export const ITAM_SQL_BY_CARD = {
  itKpis: { title: "IT number tiles", sql: IT_KPI_SQL },
  statusByCategory: { title: "Devices by type and status", sql: STATUS_BY_CATEGORY_SQL },
  offboarding: { title: "Offboarding gaps", sql: OFFBOARDING_SQL },
  newHires: { title: "New hires and their devices", sql: NEW_HIRES_SQL },
  assets: { title: "Every IT asset", sql: ASSETS_SQL },
  assetEvents: { title: "Asset history", sql: ASSET_EVENTS_SQL },
  warranty: { title: "Warranties and refresh dates", sql: WARRANTY_SQL },
  refreshPlan: { title: "Refresh plan by quarter", sql: REFRESH_PLAN_SQL },
  deviceHealth: { title: "Device health checks", sql: DEVICE_HEALTH_SQL },
  licenses: { title: "License seats and waste", sql: LICENSES_SQL },
} as const;
