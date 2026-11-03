// Integration tests: build a fresh database from the three SQL files, then
// check the dashboard's queries against numbers worked out separately in
// JavaScript from the same made-up data. Also checks the read-only user
// really can't change anything.
//
// Needs a Postgres you own. Skipped unless TEST_ADMIN_DATABASE_URL is set, e.g.
//   TEST_ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm test
import { readFileSync } from "node:fs";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSeed } from "../scripts/seed-data.mjs";
import { getKpis, getMismatches, getSupplierTotals, getWeeklyUnits } from "@/lib/data";
import { PLACEHOLDER_PASSWORD } from "@/lib/db";
import { assertReadOnlyUser, ReadOnlyUserError, runReadOnlyQuery } from "@/lib/run-readonly";

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL;
const TEST_DB = "receiving_test";
const READER_PASSWORD = "test_reader_pw_123";

const sqlFile = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), "utf8");
const withDb = (url: string, db: string, user?: string, password?: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) { u.username = user; u.password = password ?? ""; }
  return u.toString();
};

describe.skipIf(!ADMIN_URL)("database (needs TEST_ADMIN_DATABASE_URL)", () => {
  let owner: Pool;   // can do anything (like the Supabase "postgres" user)
  let reader: Pool;  // what the app uses
  const seed = generateSeed();

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`drop database if exists ${TEST_DB} with (force)`);
    await admin.query(`create database ${TEST_DB}`);
    await admin.end();

    owner = new Pool({ connectionString: withDb(ADMIN_URL!, TEST_DB) });
    await owner.query(sqlFile("01_schema.sql"));
    await owner.query(sqlFile("02_seed.sql"));
    await owner.query(sqlFile("03_security.sql").replaceAll(PLACEHOLDER_PASSWORD, READER_PASSWORD));
    reader = new Pool({ connectionString: withDb(ADMIN_URL!, TEST_DB, "dashboard_reader", READER_PASSWORD) });
  });

  afterAll(async () => {
    await reader?.end();
    await owner?.end();
  });

  // ---- the same rules as the SQL, written again in plain JavaScript ----
  function lineFacts() {
    const receiptById = new Map(seed.receipts.map((r) => [r.receipt_id, r]));
    const poById = new Map(seed.purchaseOrders.map((p) => [p.po_id, p]));
    return seed.poLines.map((l) => {
      const parts = seed.receiptLines.filter((rl) => rl.po_line_id === l.po_line_id);
      const po = poById.get(l.po_id)!;
      const received = parts.reduce((s, p) => s + p.qty_received, 0);
      const damaged = parts.reduce((s, p) => s + p.qty_damaged, 0);
      const last = parts.length ? Math.max(...parts.map((p) => receiptById.get(p.receipt_id)!.received_offset)) : null;
      let status: string;
      if (!parts.length) status = po.expected_offset >= 0 ? "awaiting" : "overdue";
      else if (received < l.qty_ordered) status = "short";
      else if (received > l.qty_ordered) status = "over";
      else status = "complete";
      return { ...l, po, received, damaged, last, status, hasReceipt: parts.length > 0 };
    });
  }

  it("loads every made-up row", async () => {
    const { rows } = await reader.query(`
      select (select count(*) from suppliers) s, (select count(*) from products) p,
             (select count(*) from purchase_orders) po, (select count(*) from po_lines) pl,
             (select count(*) from receipts) r, (select count(*) from receipt_lines) rl`);
    expect(rows[0]).toEqual({
      s: String(seed.suppliers.length), p: String(seed.products.length), po: String(seed.purchaseOrders.length),
      pl: String(seed.poLines.length), r: String(seed.receipts.length), rl: String(seed.receiptLines.length),
    });
  });

  it("view statuses match the rules", async () => {
    const { rows } = await reader.query("select po_line_id, status from po_line_status");
    const sqlStatus = new Map(rows.map((r) => [r.po_line_id, r.status]));
    for (const f of lineFacts()) expect(sqlStatus.get(f.po_line_id), `line ${f.po_line_id}`).toBe(f.status);
  });

  it("KPI tiles match", async () => {
    const facts = lineFacts();
    const recent = seed.receipts.filter((r) => r.received_offset >= -6);
    const recentIds = new Set(recent.map((r) => r.receipt_id));
    expect(await getKpis(reader)).toEqual({
      deliveries7d: recent.length,
      units7d: seed.receiptLines.filter((rl) => recentIds.has(rl.receipt_id)).reduce((s, rl) => s + rl.qty_received, 0),
      mismatchedLines30d: facts.filter((f) => (f.status === "short" || f.status === "over") && f.last !== null && f.last >= -29).length,
      overdueLines: facts.filter((f) => f.status === "overdue").length,
    });
  });

  it("supplier totals (JOIN + GROUP BY) match", async () => {
    const due = lineFacts().filter((f) => f.po.expected_offset < 0);
    const expected = seed.suppliers.map((s) => {
      const lines = due.filter((f) => f.po.supplier_id === s.supplier_id);
      const ordered = lines.reduce((a, f) => a + f.qty_ordered, 0);
      const capped = lines.reduce((a, f) => a + Math.min(f.received, f.qty_ordered), 0);
      return {
        supplier: s.name,
        orders: new Set(lines.map((f) => f.po_id)).size,
        unitsOrdered: ordered,
        unitsReceived: lines.reduce((a, f) => a + f.received, 0),
        fillRatePct: Math.round((1000 * capped) / ordered) / 10,
        valueReceived: Math.round(lines.reduce((a, f) => a + f.received * Number(f.unit_cost), 0) * 100) / 100,
      };
    });
    const actual = await getSupplierTotals(reader);
    expect(actual).toHaveLength(seed.suppliers.length);
    for (const e of expected) {
      const a = actual.find((r) => r.supplier === e.supplier)!;
      expect(a).toMatchObject({ orders: e.orders, unitsOrdered: e.unitsOrdered, unitsReceived: e.unitsReceived });
      expect(a.fillRatePct).toBeCloseTo(e.fillRatePct, 1);
      expect(a.valueReceived).toBeCloseTo(e.valueReceived, 2);
    }
    // sorted by value, biggest first
    const values = actual.map((r) => r.valueReceived);
    expect(values).toEqual([...values].sort((x, y) => y - x));
  });

  it("weekly chart has 12 weeks and the right total", async () => {
    const weeks = await getWeeklyUnits(reader);
    expect(weeks).toHaveLength(12);
    const { rows } = await reader.query("select extract(isodow from current_date)::int as dow");
    const windowStart = -(rows[0].dow - 1) - 77; // Monday 11 weeks before this week's Monday
    const inWindow = new Set(seed.receipts.filter((r) => r.received_offset >= windowStart).map((r) => r.receipt_id));
    const expected = seed.receiptLines.filter((rl) => inWindow.has(rl.receipt_id)).reduce((s, rl) => s + rl.qty_received, 0);
    expect(weeks.reduce((s, w) => s + w.unitsReceived, 0)).toBe(expected);
  });

  it("mismatch list shows short, over and damaged lines, newest first, max 20", async () => {
    const rows = await getMismatches(reader);
    const all = lineFacts().filter((f) => f.status === "short" || f.status === "over" || f.damaged > 0);
    expect(rows).toHaveLength(Math.min(20, all.length));
    for (const r of rows) expect(r.status === "short" || r.status === "over" || r.qtyDamaged > 0).toBe(true);
    const dates = rows.map((r) => r.lastReceivedOn!);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  // ------------------------------ safety ------------------------------
  it("the reader cannot insert, update, delete or create", async () => {
    await expect(reader.query("insert into suppliers (name, city, lead_time_days) values ('x', 'y', 3)")).rejects.toThrow();
    await expect(reader.query("update po_lines set qty_ordered = 1")).rejects.toThrow();
    await expect(reader.query("delete from receipts")).rejects.toThrow();
    await expect(reader.query("create table receiving.hack (id int)")).rejects.toThrow();
    const { rows } = await owner.query("select count(*)::int as n from receiving.receipts");
    expect(rows[0].n).toBe(seed.receipts.length);
  });

  it("even if the SQL check were skipped, a data-changing query fails in the read-only runner", async () => {
    await expect(
      runReadOnlyQuery(reader, "with gone as (delete from receipts returning *) select * from gone"),
    ).rejects.toThrow();
    const { rows } = await owner.query("select count(*)::int as n from receiving.receipts");
    expect(rows[0].n).toBe(seed.receipts.length);
  });

  it("the read-only runner caps rows at 200", async () => {
    const r = await runReadOnlyQuery(reader, "select * from po_line_status cross join suppliers");
    expect(r.rows).toHaveLength(200);
    expect(r.truncated).toBe(true);
  });

  it("the read-only runner stops slow queries", async () => {
    await expect(
      runReadOnlyQuery(reader, "select count(*) from generate_series(1, 100000000)"),
    ).rejects.toThrow(/statement timeout/);
  });

  it("the AI box refuses to run when connected as the owner", async () => {
    const client = await owner.connect();
    try {
      await expect(assertReadOnlyUser(client)).rejects.toBeInstanceOf(ReadOnlyUserError);
    } finally {
      client.release();
    }
  });

  it("row level security: a role with SELECT but no policy sees nothing", async () => {
    await owner.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'test_public_api') then
          create role test_public_api login password 'test_public_pw';
        end if;
      end $$;
      grant usage on schema receiving to test_public_api;
      grant select on all tables in schema receiving to test_public_api;`);
    const outsider = new Pool({ connectionString: withDb(ADMIN_URL!, TEST_DB, "test_public_api", "test_public_pw") });
    try {
      const { rows } = await outsider.query(
        "select (select count(*)::int from receiving.suppliers) as s, (select count(*)::int from receiving.po_line_status) as v");
      expect(rows[0]).toEqual({ s: 0, v: 0 });
    } finally {
      await outsider.end();
      await owner.query("revoke all on all tables in schema receiving from test_public_api; revoke usage on schema receiving from test_public_api");
    }
  });
});
