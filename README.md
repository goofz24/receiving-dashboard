# Receiving Dashboard

A stock-receiving dashboard on **Postgres (Supabase)** and **Next.js**, in a frosted-glass design with smooth animations. It answers the questions a receiving manager asks every week: what arrived, how each supplier is doing, and which deliveries didn't match the order. Every number on the page comes from a SQL query you can open with the **</>** button on its card.

It also has an **IT asset tracker** (ITAM): every laptop, phone, screen and software seat from purchase to disposal, with the problems an IT team has to chase: devices still with people who left, laptops with BitLocker off, warranties about to end, and software seats nobody uses. See [IT asset tracker](#it-asset-tracker) below.

An optional **AI question box** turns a plain-English question into one read-only SQL query with the Claude API, shows the query, and runs it as a database user that can't change anything.

> **All data is made up.** Suppliers, products, prices and quantities are invented by `scripts/seed-data.mjs`. No real company's data is used.

![Dashboard](docs/screenshots/dashboard-light.png)

| Suppliers (dark mode) | Mismatches | Phone |
|---|---|---|
| ![Suppliers](docs/screenshots/dashboard-dark.png) | ![Mismatches](docs/screenshots/mismatches.png) | ![Phone](docs/screenshots/dashboard-phone.png) |

## What it shows

| Page | What it answers | SQL ideas it uses |
|---|---|---|
| Overview | This week at a glance: 8 number tiles with trends, units per week (4/8/12 weeks), value by supplier. Click a supplier in the donut to filter the chart. | `count ... filter (where ...)`, `generate_series` + `cross join` for empty weeks, `LEFT JOIN`, `GROUP BY` |
| Deliveries | Every delivery, newest first. Open one to see its lines. Search, tabs, Copy as CSV. | `GROUP BY` on the primary key, joins to the `po_line_status` view |
| Purchase orders | Where every order line stands and how late it is | the view, `CASE` in `ORDER BY`, date math |
| Suppliers | Fill rate, on-time %, value and problem lines per supplier, with a 12-week sparkline | three `JOIN`s, a `LEFT JOIN` to a sub-query, fill rate with `least()`, `nullif` |
| Mismatches | Short, over and damaged lines, with the value at stake and a ready-to-send supplier email | the view with its `CASE` status |
| Ask AI (optional) | Anything else about the data | Claude API with structured output, read-only SQL |

Also: **Ctrl K** search for pages, suppliers, orders, products, asset tags and people; light and dark mode; works on a phone. All animations use `transform`, `opacity` or SVG strokes, so they run at the screen's full refresh rate, and they switch off when the visitor's system asks for reduced motion.

## The database

Six tables in their own `receiving` schema (see [`sql/01_schema.sql`](sql/01_schema.sql)):

```
suppliers 1──* products
suppliers 1──* purchase_orders 1──* po_lines *──1 products
purchase_orders 1──* receipts 1──* receipt_lines *──1 po_lines
```

- An **order** (`purchase_orders`) has many **lines** (`po_lines`): what was ordered.
- A **receipt** is one delivery at the dock. One order can arrive in more than one delivery, so receipts are their own table.
- A **receipt line** is what was counted for one order line on one delivery.
- The view **`po_line_status`** adds up all deliveries per order line and labels it `complete`, `short`, `over`, `overdue` or `awaiting`.

## IT asset tracker

The same idea, for IT: eight tables in their own `itam` schema ([`sql/04_itam_schema.sql`](sql/04_itam_schema.sql)), filled with made-up data for a small company with 37 people and 103 devices.

![IT overview](docs/screenshots/it-overview.png)

| Asset history | Licenses |
|---|---|
| ![Asset history](docs/screenshots/it-asset-history.png) | ![Licenses](docs/screenshots/it-licenses.png) |

```
locations 1──* employees 1──* license_seats *──1 licenses
models 1──* assets 1──* asset_events *──0..1 employees
            assets 1──* device_checks
```

- An **asset** is one physical device with its asset tag, serial number, invoice, price and warranty end date. Warranty length and useful life come from its **model**.
- Its status is **not** a column someone has to remember to update. Every change is an **event** (ordered, received, handed out, handed back, sent to repair, back from repair, lost, retired, disposed). The view **`asset_current`** reads the newest event per asset with `DISTINCT ON`, so the status, the owner and the history can never disagree.
- **`device_checks`** holds health checks from laptops and desktops (BitLocker, disk space, pending updates). The view **`device_health`** keeps the newest one per device with a `LEFT JOIN`, so a computer that never checked in still shows up.
- **`licenses`** and **`license_seats`** are the software subscriptions and who has a seat.

| Page | What it answers | SQL ideas it uses |
|---|---|---|
| IT overview | What needs attention now: devices with leavers, BitLocker off, license waste, warranties ending. Offboarding gaps with a ready help desk ticket to copy, and new hires still waiting for a laptop. | `count ... filter`, two CTEs joined to employees, `string_agg` |
| Assets | Every device, its owner and warranty. Click one for its full history. Copy as CSV. | the `asset_current` view: `DISTINCT ON`, `CASE`, `age()`, `make_interval` |
| Warranty & refresh | Warranties ending in 90 days, devices past their useful life, and a refresh budget by quarter | `generate_series` for empty quarters, `UNION ALL`, `date_trunc('quarter', ...)` |
| Device health | Laptops with BitLocker off, low disk, updates waiting, or no check-in for 30 days | the `device_health` view, boolean flags in `ORDER BY` |
| Licenses | Seats owned vs. used, seats people who left still hold, over-the-limit licenses, yearly waste, renewal dates | `LEFT JOIN` + `GROUP BY`, `count(*) filter`, `greatest()` |

The dashboard only reads. It never changes a record or sends anything: buttons copy a ticket or a list for a person to act on.

Two columns are ready for other projects: `assets.source` can be `'invoice_reader'` for records read from purchase invoices by the Receiving Document Reader, and `device_checks.source` can be `'health_check'` for real check-ins from a PowerShell health-check script. Every row today is sample data.

## Safety: why the AI box can't break anything

1. **Read-only database user.** The app logs in as `dashboard_reader`, which only has `SELECT` ([`sql/03_security.sql`](sql/03_security.sql)). Its transactions are read-only by default and stop after 5 seconds.
2. **The app checks who it is.** Before running AI SQL it confirms the connected user can't insert, update, delete or bypass row security. If you paste the owner's connection string by mistake, the AI box refuses to run.
3. **A SQL check before the database.** [`src/lib/sql-guard.ts`](src/lib/sql-guard.ts) only lets through one `SELECT`/`WITH` statement, with no comments, no data-changing words, no system tables and no risky functions.
4. **A read-only transaction with limits.** The query runs inside `BEGIN READ ONLY`, with a 3-second timeout and at most 200 rows, and is always rolled back.
5. **Row Level Security.** If the schema were ever exposed through Supabase's public API, other roles would see zero rows.
6. **Cost limits.** Questions are capped per day (`ASK_DAILY_LIMIT`, default 20), each call uses low effort and a small token limit, and every call logs its token count and estimated cost.

The tests prove layers 1, 2, 4 and 5 against a real Postgres database, including a data-changing query that skips the SQL check and still fails.

## Run it

You need Node.js 20 or newer and a Postgres database. The free Supabase plan works.

1. **Create the tables.** In Supabase, open **SQL Editor**, and run these files in order:
   - `sql/01_schema.sql` (tables and the view)
   - `sql/02_seed.sql` (made-up data)
   - `sql/03_security.sql`, **after** replacing `REPLACE_WITH_A_LONG_RANDOM_PASSWORD` with a long random password
   - `sql/04_itam_schema.sql`, `sql/05_itam_seed.sql` and `sql/06_itam_security.sql` for the IT asset pages (optional: without them the receiving pages still work, and the IT pages say what to run)
2. **Get the connection string.** In Supabase, click **Connect**, copy the **Session pooler** string, and change the user from `postgres.<project-ref>` to `dashboard_reader.<project-ref>`. Put in the password from step 1.
3. **Set up the app.**
   ```bash
   npm install
   cp .env.example .env.local    # then paste DATABASE_URL into .env.local
   npm run dev                   # open http://localhost:3000
   ```
4. **Optional, AI box:** add `ANTHROPIC_API_KEY` to `.env.local` and restart. Use included or prepaid credit, with no card and auto-reload off.

## Tests

```bash
npm test                     # unit tests (no database needed)
TEST_ADMIN_DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres npm test   # + database tests
```

The database tests build a fresh database from the SQL files, then compare every dashboard number with the same numbers worked out separately in JavaScript from the seed data. For the IT pages that includes working out every asset's status and owner again from its events. They also try to write as the read-only user and check that it fails, and check that the receiving pages still load in a database without the IT tables. The AI box tests use a fake model, so they cost nothing.

Current result: **67 tests pass** (34 unit, 33 database), run against Postgres 16.

## Project layout

```
sql/                      01_schema.sql, 02_seed.sql (generated), 03_security.sql
                          04_itam_schema.sql, 05_itam_seed.sql (generated), 06_itam_security.sql
scripts/                  seed-data.mjs, itam-seed-data.mjs (made-up data), generate-seed.mjs
src/lib/queries.ts        every receiving query, with comments
src/lib/itam-queries.ts   every IT asset query, with comments
src/lib/data.ts           runs the queries, turns rows into typed objects (itam-data.ts for IT)
src/lib/view-helpers.ts   small helpers: chart scale, trends, follow-up emails, CSV
src/lib/itam-helpers.ts   IT helpers: labels, warranty text, offboarding ticket
src/lib/sql-guard.ts      checks AI-written SQL
src/lib/run-readonly.ts   runs AI SQL as read-only with limits
src/lib/ask.ts            the Claude API call (structured output) and the ask flow
src/app/                  the Next.js page, the /api/ask route, globals.css (design + animations)
src/components/           Dashboard.tsx (menu, search, light/dark), pages/, charts.tsx, ui.tsx
tests/                    unit and database tests
```

## How I built it

Built with **Claude Code**. The idea comes from my eight years as a stock manager: counting deliveries, catching short shipments and following up with suppliers. The IT asset tracker applies the same discipline (receive it, record who has it, get it back, retire it properly) to company devices and software. Claude Code wrote the SQL, the app and the tests. What I checked myself is listed below. I only tick a box after I have actually done it.

- [ ] Ran the three SQL files in my own Supabase project
- [ ] Ran the dashboard locally and compared the numbers with the data
- [ ] Ran the tests myself
- [ ] Can explain the tables, the supplier-totals query and the read-only user without notes
- [ ] Can explain the IT tables, how asset_current gets each status from the events, and the offboarding-gaps query without notes
- [ ] Tried the AI question box with my own API key
- [ ] Did one of the exercises in the tutorial myself

## Not done yet

- The AI box has only been tested with a fake model, not yet with a real API key.
- Receipts are entered by the seed script. A later version could load them from the Receiving Document Reader project (the `receipts.source` column is ready for that).
- IT assets and health checks are sample data. Later versions could create asset records from purchase invoices (Receiving Document Reader) and take real check-ins from a PowerShell health-check script (the two `source` columns are ready).
