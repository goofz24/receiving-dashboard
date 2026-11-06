// Integration tests for the IT asset tracker: build a fresh database from
// all six SQL files, then check every IT query against numbers worked out
// separately in JavaScript from the same made-up data. Also checks the
// read-only user can't change the IT tables, and that the receiving pages
// still work in a database that doesn't have the IT tables yet.
//
// Skipped unless TEST_ADMIN_DATABASE_URL is set (see database.test.ts).
import { readFileSync } from "node:fs";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateItamSeed } from "../scripts/itam-seed-data.mjs";
import { getDashboardData } from "@/lib/data";
import {
  getAssetEvents, getAssets, getDeviceHealth, getItamData, getItKpis, getLicenses, getNewHires, getOffboarding,
  getRefreshPlan, getStatusByCategory, getWarranty,
} from "@/lib/itam-data";
import { PLACEHOLDER_PASSWORD } from "@/lib/db";
import { runReadOnlyQuery } from "@/lib/run-readonly";

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL;
const TEST_DB = "itam_test";
const BARE_DB = "itam_not_set_up_test";
const READER_PASSWORD = "test_reader_pw_123";

const sqlFile = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), "utf8");
const withDb = (url: string, db: string, user?: string, password?: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) { u.username = user; u.password = password ?? ""; }
  return u.toString();
};

// ---- calendar helpers, done in UTC so time zones can't shift a day ----
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (base: string, n: number) => { const d = toDate(base); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
// Postgres: date + N months keeps the day, or uses the month's last day if it is shorter (Jan 31 + 1 month = Feb 28).
function addMonths(base: string, months: number) {
  const d = toDate(base);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(day, last))));
}
// whole months between two dates, like extract(year/month from age(...))
function monthsBetween(from: string, to: string) {
  const a = toDate(from), b = toDate(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}
const quarterStart = (isoDay: string) => { const d = toDate(isoDay); return iso(new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1))); };

describe.skipIf(!ADMIN_URL)("IT asset tracker database (needs TEST_ADMIN_DATABASE_URL)", () => {
  let owner: Pool;
  let reader: Pool;
  let today: string;
  const seed = generateItamSeed();

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    for (const db of [TEST_DB, BARE_DB]) {
      await admin.query(`drop database if exists ${db} with (force)`);
      await admin.query(`create database ${db}`);
    }
    await admin.end();

    owner = new Pool({ connectionString: withDb(ADMIN_URL!, TEST_DB) });
    for (const f of ["01_schema.sql", "02_seed.sql", "03_security.sql", "04_itam_schema.sql", "05_itam_seed.sql", "06_itam_security.sql"]) {
      await owner.query(sqlFile(f).replaceAll(PLACEHOLDER_PASSWORD, READER_PASSWORD));
    }
    reader = new Pool({ connectionString: withDb(ADMIN_URL!, TEST_DB, "dashboard_reader", READER_PASSWORD) });
    today = (await reader.query("select current_date::text as d")).rows[0].d;
  });

  afterAll(async () => {
    await reader?.end();
    await owner?.end();
  });

  // ---- the same rules as the SQL views, written again in plain JavaScript ----
  const STATUS: Record<string, string> = {
    ordered: "ordered", received: "in_stock", returned: "in_stock", repair_back: "in_stock", deployed: "deployed",
    repair_out: "in_repair", lost: "lost", retired: "retired", disposed: "disposed",
  };
  const IN_USE = new Set(["deployed", "in_stock", "in_repair"]);
  const empById = new Map(seed.employees.map((e) => [e.employee_id, e]));
  const modelById = new Map(seed.models.map((m) => [m.model_id, m]));

  function assetFacts() {
    return seed.assets.map((a) => {
      // events are stored oldest first (ties keep their order), so the last one is the newest
      const evs = seed.events.filter((e) => e.asset_id === a.asset_id);
      const last = evs[evs.length - 1];
      const hand = evs.filter((e) => e.event_type === "deployed" || e.event_type === "returned").pop();
      const ownerId = hand?.event_type === "deployed" && (last.event_type === "deployed" || last.event_type === "repair_out") ? hand.employee_id : null;
      const model = modelById.get(a.model_id)!;
      const purchased = addDays(today, a.purchased_offset);
      return {
        ...a, model, status: STATUS[last.event_type], statusSince: addDays(today, last.event_offset), ownerId,
        owner: ownerId ? empById.get(ownerId)! : null, purchased, warrantyDaysLeft: a.warranty_offset,
        refreshDue: addMonths(purchased, model.useful_life_months), ageMonths: monthsBetween(purchased, today),
      };
    });
  }
  function latestChecks() {
    const m = new Map<number, (typeof seed.checks)[number]>();
    for (const c of seed.checks) { const p = m.get(c.asset_id); if (!p || c.checked_offset > p.checked_offset) m.set(c.asset_id, c); }
    return m;
  }
  const healthFacts = () => {
    const latest = latestChecks();
    return assetFacts().filter((a) => (a.category === "laptop" || a.category === "desktop") && a.status === "deployed")
      .map((a) => ({ a, c: latest.get(a.asset_id) ?? null }));
  };

  it("loads every made-up row", async () => {
    const { rows } = await reader.query(`
      select (select count(*)::int from itam.employees) e, (select count(*)::int from itam.models) m,
             (select count(*)::int from itam.assets) a, (select count(*)::int from itam.asset_events) ev,
             (select count(*)::int from itam.device_checks) c, (select count(*)::int from itam.licenses) l,
             (select count(*)::int from itam.license_seats) s`);
    expect(rows[0]).toEqual({
      e: seed.employees.length, m: seed.models.length, a: seed.assets.length, ev: seed.events.length,
      c: seed.checks.length, l: seed.licenses.length, s: seed.seats.length,
    });
  });

  it("asset_current: status, owner, dates and age match the event history", async () => {
    const rows = await getAssets(reader);
    expect(rows).toHaveLength(seed.assets.length);
    const byId = new Map(rows.map((r) => [r.assetId, r]));
    for (const f of assetFacts()) {
      const r = byId.get(f.asset_id)!;
      expect(r.status, f.asset_tag).toBe(f.status);
      expect(r.statusSince, f.asset_tag).toBe(f.statusSince);
      expect(r.assignedTo, f.asset_tag).toBe(f.owner?.full_name ?? null);
      expect(r.ownerLeftOn, f.asset_tag).toBe(f.owner?.left_offset != null ? addDays(today, f.owner.left_offset) : null);
      expect(r.purchasedOn, f.asset_tag).toBe(f.purchased);
      expect(r.warrantyDaysLeft, f.asset_tag).toBe(f.warrantyDaysLeft);
      expect(r.refreshDueOn, f.asset_tag).toBe(f.refreshDue);
      expect(r.ageMonths, f.asset_tag).toBe(f.ageMonths);
    }
  });

  it("the sample data has the problems the dashboard is meant to find", async () => {
    // if a change to the seed script removed them, the demo would have nothing to show
    const k = await getItKpis(reader);
    expect(k.withLeavers).toBeGreaterThan(0);
    expect(k.bitlockerOff).toBeGreaterThan(0);
    expect(k.warrantyEnding90d).toBeGreaterThan(0);
    expect(k.pastUsefulLife).toBeGreaterThan(0);
    expect(k.personalNoOwner).toBeGreaterThan(0);
    expect((await getLicenses(reader)).some((l) => l.seatsFree < 0)).toBe(true);
  });

  it("IT number tiles match", async () => {
    const facts = assetFacts();
    const inUse = facts.filter((f) => IN_USE.has(f.status));
    const health = healthFacts();
    expect(await getItKpis(reader)).toEqual({
      activeAssets: facts.filter((f) => !["retired", "disposed", "lost"].includes(f.status)).length,
      deployed: facts.filter((f) => f.status === "deployed").length,
      inStock: facts.filter((f) => f.status === "in_stock").length,
      inRepair: facts.filter((f) => f.status === "in_repair").length,
      onOrder: facts.filter((f) => f.status === "ordered").length,
      valueInUse: inUse.reduce((s, f) => s + f.purchase_cost, 0),
      warrantyEnding90d: inUse.filter((f) => f.warrantyDaysLeft >= 0 && f.warrantyDaysLeft <= 90).length,
      pastUsefulLife: inUse.filter((f) => f.refreshDue <= today).length,
      withLeavers: facts.filter((f) => f.status === "deployed" && f.owner?.left_offset != null).length,
      personalNoOwner: facts.filter((f) => f.status === "deployed" && !f.ownerId && ["laptop", "phone", "tablet"].includes(f.category)).length,
      bitlockerOff: health.filter((h) => h.c && !h.c.bitlocker_on).length,
      notChecked30d: health.filter((h) => !h.c || -h.c.checked_offset > 30).length,
    });
  });

  it("devices by type and status add up to every asset", async () => {
    const rows = await getStatusByCategory(reader);
    expect(rows.reduce((s, r) => s + r.assets, 0)).toBe(seed.assets.length);
    const facts = assetFacts();
    for (const r of rows) expect(r.assets, `${r.category}/${r.status}`).toBe(facts.filter((f) => f.category === r.category && f.status === r.status).length);
  });

  it("history: every event once, oldest first per asset", async () => {
    const rows = await getAssetEvents(reader);
    expect(rows).toHaveLength(seed.events.length);
    expect(rows.map((r) => r.eventId)).toEqual(seed.events.map((e) => e.event_id));
  });

  it("offboarding gaps: exactly the leavers who still have a device or a seat", async () => {
    const facts = assetFacts();
    const rows = await getOffboarding(reader);
    const leavers = seed.employees.filter((e) => e.left_offset !== null);
    const expected = leavers.map((e) => {
      const devices = facts.filter((f) => f.status === "deployed" && f.ownerId === e.employee_id);
      const seats = seed.seats.filter((s) => s.employee_id === e.employee_id);
      return { e, devices, seats };
    }).filter((x) => x.devices.length || x.seats.length);
    expect(rows.map((r) => r.fullName).sort()).toEqual(expected.map((x) => x.e.full_name).sort());
    for (const x of expected) {
      const r = rows.find((y) => y.employeeId === x.e.employee_id)!;
      expect(r.devices).toBe(x.devices.length);
      expect(r.deviceValue).toBeCloseTo(x.devices.reduce((s, f) => s + f.purchase_cost, 0), 2);
      expect(r.seats).toBe(x.seats.length);
      expect(r.daysSinceLeft).toBe(-x.e.left_offset!);
    }
    const left = rows.map((r) => r.leftOn);
    expect(left).toEqual([...left].sort().reverse()); // most recent leaver first
  });

  it("new hires: everyone who started in the last 30 days, with their laptops", async () => {
    const facts = assetFacts();
    const rows = await getNewHires(reader);
    const hires = seed.employees.filter((e) => e.left_offset === null && e.started_offset >= -30);
    expect(rows.map((r) => r.fullName).sort()).toEqual(hires.map((e) => e.full_name).sort());
    for (const r of rows) {
      const mine = facts.filter((f) => f.status === "deployed" && f.ownerId === r.employeeId);
      expect(r.devices, r.fullName).toBe(mine.length);
      expect(r.laptops, r.fullName).toBe(mine.filter((f) => f.category === "laptop").length);
    }
    expect(rows.some((r) => r.laptops === 0)).toBe(true); // someone is still waiting for a laptop
  });

  it("warranty & refresh list: in-use devices ending warranty in 90 days or due for refresh within a year", async () => {
    const rows = await getWarranty(reader);
    const yearOut = addDays(today, 365);
    const expected = assetFacts().filter((f) => IN_USE.has(f.status) && (f.warrantyDaysLeft <= 90 || f.refreshDue <= yearOut));
    expect(rows.map((r) => r.assetTag).sort()).toEqual(expected.map((f) => f.asset_tag).sort());
    const days = rows.map((r) => r.warrantyDaysLeft);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("refresh plan: overdue plus the next four quarters, costs add up", async () => {
    const rows = await getRefreshPlan(reader);
    expect(rows).toHaveLength(5);
    expect(rows[0].bucket).toBe("Overdue");
    const q0 = quarterStart(today);
    const quarters = [0, 3, 6, 9].map((m) => addMonths(q0, m));
    expect(rows.slice(1).map((r) => r.quarterStart)).toEqual(quarters);
    const inUse = assetFacts().filter((f) => IN_USE.has(f.status));
    const overdue = inUse.filter((f) => f.refreshDue < q0);
    expect(rows[0].assets).toBe(overdue.length);
    expect(rows[0].replacementCost).toBeCloseTo(overdue.reduce((s, f) => s + f.purchase_cost, 0), 2);
    rows.slice(1).forEach((r, i) => {
      const mine = inUse.filter((f) => quarterStart(f.refreshDue) === quarters[i]);
      expect(r.assets, r.bucket).toBe(mine.length);
      expect(r.replacementCost, r.bucket).toBeCloseTo(mine.reduce((s, f) => s + f.purchase_cost, 0), 2);
    });
  });

  it("device health: newest check for every deployed computer, never-checked ones included", async () => {
    const rows = await getDeviceHealth(reader);
    const facts = healthFacts();
    expect(rows).toHaveLength(facts.length);
    for (const { a, c } of facts) {
      const r = rows.find((x) => x.assetId === a.asset_id)!;
      if (!c) { expect(r.checkedOn, a.asset_tag).toBeNull(); expect(r.flagNotChecked).toBe(true); continue; }
      expect(r.checkedOn, a.asset_tag).toBe(addDays(today, c.checked_offset));
      expect(r.bitlockerOn).toBe(c.bitlocker_on);
      expect(r.diskFreePct).toBeCloseTo(c.disk_free_pct, 1);
      expect(r.pendingUpdates).toBe(c.pending_updates);
      expect(r.flagBitlocker).toBe(!c.bitlocker_on);
      expect(r.flagLowDisk).toBe(c.disk_free_pct < 15);
      expect(r.flagUpdates).toBe(c.pending_updates > 5);
      expect(r.flagNotChecked).toBe(-c.checked_offset > 30);
    }
  });

  it("licenses: seats used, leaver seats, free seats and yearly waste", async () => {
    const rows = await getLicenses(reader);
    expect(rows).toHaveLength(seed.licenses.length);
    for (const l of seed.licenses) {
      const seats = seed.seats.filter((s) => s.license_id === l.license_id);
      const leavers = seats.filter((s) => empById.get(s.employee_id)!.left_offset !== null).length;
      const r = rows.find((x) => x.licenseId === l.license_id)!;
      expect(r).toMatchObject({ seatsOwned: l.seats_owned, seatsUsed: seats.length, seatsWithLeavers: leavers, seatsFree: l.seats_owned - seats.length, renewsInDays: l.renews_offset });
      expect(r.costPerYear).toBeCloseTo(l.seats_owned * l.cost_per_seat_year, 2);
      expect(r.wastePerYear).toBeCloseTo((Math.max(l.seats_owned - seats.length, 0) + leavers) * l.cost_per_seat_year, 2);
    }
  });

  it("getItamData loads everything at once", async () => {
    const all = await getItamData(reader);
    expect(all.assets).toHaveLength(seed.assets.length);
    expect(all.licenses).toHaveLength(seed.licenses.length);
  });

  // ------------------------------ safety ------------------------------
  it("the reader cannot change the IT tables", async () => {
    await expect(reader.query("insert into itam.locations (name, city) values ('x', 'y')")).rejects.toThrow();
    await expect(reader.query("update itam.assets set purchase_cost = 0")).rejects.toThrow();
    await expect(reader.query("delete from itam.asset_events")).rejects.toThrow();
    await expect(reader.query("create table itam.hack (id int)")).rejects.toThrow();
    const { rows } = await owner.query("select count(*)::int as n from itam.asset_events");
    expect(rows[0].n).toBe(seed.events.length);
  });

  it("the AI box's read-only runner can read the IT views, and still can't delete", async () => {
    const r = await runReadOnlyQuery(reader, "select asset_tag, status from asset_current where category = 'laptop'");
    expect(r.columns).toEqual(["asset_tag", "status"]);
    expect(r.rows.length).toBe(seed.assets.filter((a) => a.category === "laptop").length);
    await expect(runReadOnlyQuery(reader, "with gone as (delete from itam.asset_events returning *) select * from gone")).rejects.toThrow();
  });

  it("row level security: a role with SELECT but no policy sees no IT rows", async () => {
    await owner.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'test_public_api') then
          create role test_public_api login password 'test_public_pw';
        end if;
      end $$;
      grant usage on schema itam to test_public_api;
      grant select on all tables in schema itam to test_public_api;`);
    const outsider = new Pool({ connectionString: withDb(ADMIN_URL!, TEST_DB, "test_public_api", "test_public_pw") });
    try {
      const { rows } = await outsider.query(
        "select (select count(*)::int from itam.employees) as e, (select count(*)::int from itam.asset_current) as a, (select count(*)::int from itam.license_seats) as s");
      expect(rows[0]).toEqual({ e: 0, a: 0, s: 0 });
    } finally {
      await outsider.end();
      await owner.query("revoke all on all tables in schema itam from test_public_api; revoke usage on schema itam from test_public_api");
    }
  });

  it("a database without the IT tables still loads the receiving pages (IT part is null)", async () => {
    const bareOwner = new Pool({ connectionString: withDb(ADMIN_URL!, BARE_DB) });
    const bareReader = new Pool({ connectionString: withDb(ADMIN_URL!, BARE_DB, "dashboard_reader", READER_PASSWORD) });
    try {
      for (const f of ["01_schema.sql", "02_seed.sql", "03_security.sql"]) await bareOwner.query(sqlFile(f).replaceAll(PLACEHOLDER_PASSWORD, READER_PASSWORD));
      const data = await getDashboardData(bareReader);
      expect(data.itam).toBeNull();
      expect(data.deliveries.length).toBeGreaterThan(0);
    } finally {
      await bareReader.end();
      await bareOwner.end();
    }
  });
});
