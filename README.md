# Receiving Dashboard

A stock-receiving dashboard on **Postgres (Supabase)** and **Next.js**. It answers the questions a receiving manager asks every week: what arrived, how each supplier is doing, and which deliveries didn't match the order. Every number on the page comes from a SQL query you can open and read right under it.

An optional **AI question box** turns a plain-English question into one read-only SQL query with the Claude API, shows the query, and runs it as a database user that can't change anything.

> **All data is made up.** Suppliers, products, prices and quantities are invented by `scripts/seed-data.mjs`. No real company's data is used.

![Dashboard](docs/screenshots/dashboard-light.png)

## What it shows

| Panel | Question it answers | SQL ideas it uses |
|---|---|---|
| Four number tiles | Deliveries and units this week, count mismatches, overdue lines | sub-queries, `count`, `sum`, date math |
| Units received per week | Is receiving volume steady? | `generate_series` to include empty weeks, `LEFT JOIN`, `GROUP BY` |
| Supplier totals | Which suppliers ship complete orders? | three `JOIN`s, a `LEFT JOIN` to a sub-query, `GROUP BY`, fill rate with `least()` |
| Count mismatches | Which order lines came in short, over or damaged? | a **view** (`po_line_status`) with a `CASE` status |
| Ask a question (optional) | Anything else about the data | Claude API with structured output, read-only SQL |

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

The database tests build a fresh database from the three SQL files, then compare every dashboard number with the same numbers worked out separately in JavaScript from the seed data. They also try to write as the read-only user and check that it fails. The AI box tests use a fake model, so they cost nothing.

Current result: **34 tests pass** (22 unit, 12 database), run against Postgres 16.

## Project layout

```
sql/                 01_schema.sql, 02_seed.sql (generated), 03_security.sql
scripts/             seed-data.mjs (made-up data), generate-seed.mjs
src/lib/queries.ts   every dashboard query, with comments
src/lib/data.ts      runs the queries, turns rows into typed objects
src/lib/sql-guard.ts checks AI-written SQL
src/lib/run-readonly.ts  runs AI SQL as read-only with limits
src/lib/ask.ts       the Claude API call (structured output) and the ask flow
src/app/             the Next.js page and the /api/ask route
tests/               unit and database tests
```

## How I built it

Built with **Claude Code**. The idea comes from my eight years as a stock manager: counting deliveries, catching short shipments and following up with suppliers. Claude Code wrote the SQL, the app and the tests. What I checked myself is listed below. I only tick a box after I have actually done it.

- [ ] Ran the three SQL files in my own Supabase project
- [ ] Ran the dashboard locally and compared the numbers with the data
- [ ] Ran the tests myself
- [ ] Can explain the tables, the supplier-totals query and the read-only user without notes
- [ ] Tried the AI question box with my own API key
- [ ] Did one of the exercises in the tutorial myself

## Not done yet

- Not deployed anywhere.
- The AI box has only been tested with a fake model, not yet with a real API key.
- Receipts are entered by the seed script. A later version could load them from the Receiving Document Reader project (the `receipts.source` column is ready for that).
