-- =====================================================================
-- 04_itam_schema.sql : the IT asset tracker (ITAM) tables
-- All data in this project is MADE UP. No real company, person, serial
-- number or price is used.
--
-- The IT tables live in their own schema, "itam" (IT Asset Management),
-- next to "receiving". Like "receiving", it is not in Supabase's public
-- Data API.
--
-- The main idea: an asset's status is NOT stored in a column that someone
-- has to remember to update. Every change is an EVENT (ordered, received,
-- deployed, returned, sent to repair...). The view asset_current reads the
-- latest event for each asset, so the status always matches the history.
-- =====================================================================

drop schema if exists itam cascade;
create schema itam;

-- Where things are: offices, the warehouse, "Remote" for people at home.
create table itam.locations (
  location_id integer generated always as identity primary key,
  name        text not null unique,
  city        text not null
);

-- The people who get laptops and software. left_on is set when someone
-- leaves; that is what the offboarding checks look at.
create table itam.employees (
  employee_id integer generated always as identity primary key,
  full_name   text not null,
  email       text not null unique,
  department  text not null,
  title       text not null,
  location_id integer not null references itam.locations (location_id),
  started_on  date    not null,
  left_on     date,
  check (left_on is null or left_on >= started_on)
);

-- What kind of device it is. Warranty and useful life come from the model,
-- so every asset of the same model follows the same rules.
create table itam.models (
  model_id           integer generated always as identity primary key,
  category           text    not null check (category in ('laptop', 'desktop', 'monitor', 'phone', 'tablet', 'dock', 'printer')),
  manufacturer       text    not null,
  model_name         text    not null,
  warranty_months    integer not null check (warranty_months between 0 and 120),
  useful_life_months integer not null check (useful_life_months between 12 and 120),
  unique (manufacturer, model_name)
);

-- One row per physical device. The asset tag is the sticker on the device.
-- source says how the record was created. 'invoice_reader' is for a later
-- version where the Receiving Document Reader reads purchase invoices;
-- today every seeded row is 'manual'.
create table itam.assets (
  asset_id         integer generated always as identity primary key,
  asset_tag        text           not null unique,
  serial_number    text           not null unique,
  model_id         integer        not null references itam.models (model_id),
  vendor           text           not null,
  invoice_number   text           not null,
  purchased_on     date           not null,
  purchase_cost    numeric(10, 2) not null check (purchase_cost >= 0),
  warranty_ends_on date           not null,
  location_id      integer        not null references itam.locations (location_id),
  source           text           not null default 'manual'
                   check (source in ('manual', 'invoice_reader')),
  check (warranty_ends_on >= purchased_on)
);

-- The life story of each asset. The latest event decides its status.
-- employee_id is who the device went to (for 'deployed') or came back
-- from (for 'returned'). A deployed device with no employee is a shared
-- device, like a printer or a meeting-room screen.
create table itam.asset_events (
  event_id    integer generated always as identity primary key,
  asset_id    integer not null references itam.assets (asset_id) on delete cascade,
  event_on    date    not null,
  event_type  text    not null check (event_type in
              ('ordered', 'received', 'deployed', 'returned', 'repair_out', 'repair_back', 'lost', 'retired', 'disposed')),
  employee_id integer references itam.employees (employee_id),
  done_by     text    not null,
  note        text
);

-- Results from a laptop/desktop health check (the PowerShell toolkit
-- project can send these later; today they are 'sample' rows).
create table itam.device_checks (
  check_id        integer generated always as identity primary key,
  asset_id        integer      not null references itam.assets (asset_id) on delete cascade,
  checked_on      date         not null,
  os_version      text         not null,
  bitlocker_on    boolean      not null,
  disk_free_pct   numeric(5, 1) not null check (disk_free_pct between 0 and 100),
  pending_updates integer      not null check (pending_updates >= 0),
  source          text         not null default 'sample' check (source in ('sample', 'health_check')),
  unique (asset_id, checked_on)
);

-- Software subscriptions the company pays for, per seat, per year.
create table itam.licenses (
  license_id          integer generated always as identity primary key,
  product             text           not null unique,
  vendor              text           not null,
  seats_owned         integer        not null check (seats_owned >= 0),
  cost_per_seat_year  numeric(10, 2) not null check (cost_per_seat_year >= 0),
  renews_on           date           not null
);

-- Who has a seat. A seat should be removed when the person leaves.
create table itam.license_seats (
  license_id  integer not null references itam.licenses (license_id) on delete cascade,
  employee_id integer not null references itam.employees (employee_id),
  assigned_on date    not null,
  primary key (license_id, employee_id)
);

create index on itam.employees (location_id);
create index on itam.assets (model_id);
create index on itam.asset_events (asset_id, event_on);
create index on itam.asset_events (employee_id);
create index on itam.device_checks (asset_id, checked_on);
create index on itam.license_seats (employee_id);

-- ---------------------------------------------------------------------
-- View: one row per asset with its CURRENT status, worked out from the
-- latest event. DISTINCT ON keeps the first row per asset after sorting,
-- so "order by event_on desc" means "the newest event".
-- ---------------------------------------------------------------------
create view itam.asset_current
  with (security_invoker = true)
as
with latest as (
  select distinct on (asset_id)
         asset_id, event_type, event_on, employee_id
  from itam.asset_events
  order by asset_id, event_on desc, event_id desc
),
last_hand_off as (
  -- the newest hand-out or hand-back, so a device sent to repair while
  -- someone had it still shows that person
  select distinct on (asset_id)
         asset_id, event_type, employee_id
  from itam.asset_events
  where event_type in ('deployed', 'returned')
  order by asset_id, event_on desc, event_id desc
)
select a.asset_id,
       a.asset_tag,
       a.serial_number,
       m.category,
       m.manufacturer,
       m.model_name,
       a.vendor,
       a.invoice_number,
       a.purchased_on,
       a.purchase_cost,
       a.warranty_ends_on,
       a.warranty_ends_on - current_date                       as warranty_days_left,
       -- whole months since purchase
       (extract(year from age(current_date, a.purchased_on)) * 12
        + extract(month from age(current_date, a.purchased_on)))::int as age_months,
       m.useful_life_months,
       -- when it should be replaced: purchase date + the model's useful life
       (a.purchased_on + make_interval(months => m.useful_life_months))::date as refresh_due_on,
       l.name                                                  as location,
       case lt.event_type
         when 'ordered'     then 'ordered'
         when 'received'    then 'in_stock'
         when 'returned'    then 'in_stock'
         when 'repair_back' then 'in_stock'
         when 'deployed'    then 'deployed'
         when 'repair_out'  then 'in_repair'
         when 'lost'        then 'lost'
         when 'retired'     then 'retired'
         when 'disposed'    then 'disposed'
       end                                                     as status,
       lt.event_on                                             as status_since,
       -- the user, while the device is out with them (or in repair from them)
       e.employee_id,
       e.full_name                                             as assigned_to,
       e.department,
       e.left_on                                               as owner_left_on,
       a.source
from itam.assets a
join itam.models m    on m.model_id = a.model_id
join itam.locations l on l.location_id = a.location_id
join latest lt        on lt.asset_id = a.asset_id
left join last_hand_off h on h.asset_id = a.asset_id
left join itam.employees e
       on e.employee_id = h.employee_id
      and h.event_type = 'deployed'
      and lt.event_type in ('deployed', 'repair_out');

-- ---------------------------------------------------------------------
-- View: the newest health check for each laptop and desktop that is out
-- in use (deployed). LEFT JOIN, so a device that never checked in still
-- shows up (with nulls), because "never checked" is a finding too.
-- ---------------------------------------------------------------------
create view itam.device_health
  with (security_invoker = true)
as
with latest_check as (
  select distinct on (asset_id) *
  from itam.device_checks
  order by asset_id, checked_on desc
)
select ac.asset_id,
       ac.asset_tag,
       ac.category,
       ac.manufacturer,
       ac.model_name,
       ac.status,
       ac.assigned_to,
       ac.department,
       c.checked_on,
       current_date - c.checked_on as days_since_check,
       c.os_version,
       c.bitlocker_on,
       c.disk_free_pct,
       c.pending_updates
from itam.asset_current ac
left join latest_check c on c.asset_id = ac.asset_id
where ac.category in ('laptop', 'desktop')
  and ac.status = 'deployed';
