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
import {
  getDeliveries, getDeliveryLines, getKpis, getMismatches, getOrderLines, getSupplierHealth,
  getSupplierTotals, getSupplierValue, getWeeklyUnits,
} from "@/lib/data";
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

  // helpers over the seed
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const costOf = (poLineId: number) => Number(seed.poLines.find((l) => l.po_line_id === poLineId)!.unit_cost);
  const receiptsIn = (from: number, to: number) => new Set(seed.receipts.filter((r) => r.received_offset >= from && r.received_offset <= to).map((r) => r.receipt_id));
  const linesOf = (ids: Set<number>) => seed.receiptLines.filter((rl) => ids.has(rl.receipt_id));
  async function mondayOffset() {
    const { rows } = await reader.query("select extract(isodow from current_date)::int as dow");
    return -(rows[0].dow - 1); // this week's Monday, in days from today
  }

  it("KPI tiles match", async () => {
    const facts = lineFacts();
    const units = (ids: Set<number>) => linesOf(ids).reduce((s, rl) => s + rl.qty_received, 0);
    const damaged = (ids: Set<number>) => linesOf(ids).reduce((s, rl) => s + rl.qty_damaged, 0);
    const value = (ids: Set<number>) => linesOf(ids).reduce((s, rl) => s + rl.qty_received * costOf(rl.po_line_id), 0);
    const r7 = receiptsIn(-6, 0), p7 = receiptsIn(-13, -7), r30 = receiptsIn(-29, 0), p30 = receiptsIn(-59, -30);
    const due = facts.filter((f) => f.po.expected_offset < 0);
    const { rows } = await reader.query("select current_date::text as today");
    const k = await getKpis(reader);
    expect(k).toMatchObject({
      today: rows[0].today,
      deliveries7d: r7.size, deliveriesPrev7d: p7.size,
      units7d: units(r7), unitsPrev7d: units(p7),
      damaged30d: damaged(r30), damagedPrev30d: damaged(p30),
      mismatchedLines30d: facts.filter((f) => (f.status === "short" || f.status === "over") && f.last !== null && f.last >= -29).length,
      overdueLines: facts.filter((f) => f.status === "overdue").length,
      awaitingLines: facts.filter((f) => f.status === "awaiting").length,
      openOrders: new Set(facts.filter((f) => f.status === "awaiting" || f.status === "overdue").map((f) => f.po_id)).size,
      fillRatePct: round1((100 * due.reduce((a, f) => a + Math.min(f.received, f.qty_ordered), 0)) / due.reduce((a, f) => a + f.qty_ordered, 0)),
    });
    expect(k.value30d).toBeCloseTo(value(r30), 2);
    expect(k.valuePrev30d).toBeCloseTo(value(p30), 2);
  });

  it("supplier totals (JOIN + GROUP BY) match", async () => {
    const due = lineFacts().filter((f) => f.po.expected_offset < 0);
    const actual = await getSupplierTotals(reader);
    expect(actual).toHaveLength(seed.suppliers.length);
    for (const s of seed.suppliers) {
      const lines = due.filter((f) => f.po.supplier_id === s.supplier_id);
      const ordered = lines.reduce((a, f) => a + f.qty_ordered, 0);
      const capped = lines.reduce((a, f) => a + Math.min(f.received, f.qty_ordered), 0);
      const a = actual.find((r) => r.supplierId === s.supplier_id)!;
      expect(a).toMatchObject({
        supplier: s.name, city: s.city, leadTimeDays: s.lead_time_days,
        orders: new Set(lines.map((f) => f.po_id)).size, unitsOrdered: ordered, unitsReceived: lines.reduce((x, f) => x + f.received, 0),
      });
      expect(a.fillRatePct).toBeCloseTo(round1((100 * capped) / ordered), 1);
      expect(a.valueReceived).toBeCloseTo(lines.reduce((x, f) => x + f.received * Number(f.unit_cost), 0), 2);
    }
    const values = actual.map((r) => r.valueReceived);
    expect(values).toEqual([...values].sort((x, y) => y - x)); // biggest first
  });

  it("supplier health: short, overdue and on-time lines match", async () => {
    const facts = lineFacts();
    const health = await getSupplierHealth(reader);
    for (const s of seed.suppliers) {
      const mine = facts.filter((f) => f.po.supplier_id === s.supplier_id);
      const got = mine.filter((f) => f.last !== null);
      const h = health.find((x) => x.supplierId === s.supplier_id)!;
      expect(h.shortLines).toBe(mine.filter((f) => f.status === "short").length);
      expect(h.overdueLines).toBe(mine.filter((f) => f.status === "overdue").length);
      expect(h.onTimePct).toBeCloseTo(round1((100 * got.filter((f) => f.last! <= f.po.expected_offset).length) / got.length), 1);
    }
  });

  it("weekly chart: 12 weeks for every supplier, with the right totals", async () => {
    const weeks = await getWeeklyUnits(reader);
    expect(weeks).toHaveLength(12 * seed.suppliers.length);
    expect(new Set(weeks.map((w) => w.weekStart)).size).toBe(12);
    const windowStart = (await mondayOffset()) - 77; // Monday 11 weeks before this week's Monday
    for (const s of seed.suppliers) {
      const ids = new Set(seed.receipts.filter((r) => r.received_offset >= windowStart && seed.purchaseOrders.find((p) => p.po_id === r.po_id)!.supplier_id === s.supplier_id).map((r) => r.receipt_id));
      const mine = weeks.filter((w) => w.supplierId === s.supplier_id);
      expect(mine.reduce((a, w) => a + w.unitsReceived, 0), s.name).toBe(linesOf(ids).reduce((a, rl) => a + rl.qty_received, 0));
      expect(mine.reduce((a, w) => a + w.deliveries, 0), s.name).toBe(ids.size);
    }
  });

  it("value by supplier (donut) covers the same 12 weeks", async () => {
    const windowStart = (await mondayOffset()) - 77;
    const rows = await getSupplierValue(reader);
    for (const r of rows) {
      const ids = new Set(seed.receipts.filter((x) => x.received_offset >= windowStart && seed.purchaseOrders.find((p) => p.po_id === x.po_id)!.supplier_id === r.supplierId).map((x) => x.receipt_id));
      expect(r.valueReceived, r.supplier).toBeCloseTo(linesOf(ids).reduce((a, rl) => a + rl.qty_received * costOf(rl.po_line_id), 0), 2);
    }
    const values = rows.map((r) => r.valueReceived);
    expect(values).toEqual([...values].sort((x, y) => y - x));
  });

  it("deliveries list: one row per delivery with the right totals, newest first", async () => {
    const rows = await getDeliveries(reader);
    expect(rows).toHaveLength(seed.receipts.length);
    for (const r of rows) {
      const lines = seed.receiptLines.filter((rl) => rl.receipt_id === r.receiptId);
      expect(r.lines).toBe(lines.length);
      expect(r.units).toBe(lines.reduce((a, rl) => a + rl.qty_received, 0));
      expect(r.damaged).toBe(lines.reduce((a, rl) => a + rl.qty_damaged, 0));
      expect(r.value).toBeCloseTo(lines.reduce((a, rl) => a + rl.qty_received * costOf(rl.po_line_id), 0), 2);
    }
    const dates = rows.map((r) => r.receivedOn);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(await getDeliveryLines(reader)).toHaveLength(seed.receiptLines.length);
  });

  it("order lines: every line once, with days past due and the view's status", async () => {
    const rows = await getOrderLines(reader);
    expect(rows).toHaveLength(seed.poLines.length);
    const facts = new Map(lineFacts().map((f) => [f.po_line_id, f]));
    for (const r of rows) {
      const f = facts.get(r.poLineId)!;
      expect(r.status).toBe(f.status);
      expect(r.daysPastDue).toBe(0 - f.po.expected_offset || 0); // "|| 0" turns -0 into 0
      expect(r.qtyReceived).toBe(f.received);
    }
  });

  it("mismatch list shows every short, over and damaged line, newest first", async () => {
    const rows = await getMismatches(reader);
    const all = lineFacts().filter((f) => f.status === "short" || f.status === "over" || f.damaged > 0);
    expect(rows).toHaveLength(all.length);
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
