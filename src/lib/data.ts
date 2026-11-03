import type { Pool } from "pg";
import { KPI_SQL, MISMATCHES_SQL, SUPPLIER_TOTALS_SQL, WEEKLY_UNITS_SQL } from "./queries";

// Postgres sends big numbers (count, sum, numeric) as strings so nothing
// is lost. We turn them into JavaScript numbers here; these values are
// small enough to be safe.
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null ? null : String(v));

export type Kpis = { deliveries7d: number; units7d: number; mismatchedLines30d: number; overdueLines: number };
export type SupplierRow = { supplier: string; orders: number; unitsOrdered: number; unitsReceived: number; fillRatePct: number; valueReceived: number };
export type WeekRow = { weekStart: string; unitsReceived: number };
export type MismatchRow = {
  lastReceivedOn: string | null; poNumber: string; supplier: string; sku: string; product: string;
  qtyOrdered: number; qtyReceived: number; qtyDifference: number; qtyDamaged: number; status: string;
};

export async function getKpis(pool: Pool): Promise<Kpis> {
  const { rows } = await pool.query(KPI_SQL);
  const r = rows[0];
  return { deliveries7d: n(r.deliveries_7d), units7d: n(r.units_7d), mismatchedLines30d: n(r.mismatched_lines_30d), overdueLines: n(r.overdue_lines) };
}

export async function getSupplierTotals(pool: Pool): Promise<SupplierRow[]> {
  const { rows } = await pool.query(SUPPLIER_TOTALS_SQL);
  return rows.map((r) => ({
    supplier: r.supplier, orders: n(r.orders), unitsOrdered: n(r.units_ordered), unitsReceived: n(r.units_received),
    fillRatePct: n(r.fill_rate_pct), valueReceived: n(r.value_received),
  }));
}

export async function getWeeklyUnits(pool: Pool): Promise<WeekRow[]> {
  const { rows } = await pool.query(WEEKLY_UNITS_SQL);
  return rows.map((r) => ({ weekStart: d(r.week_start) as string, unitsReceived: n(r.units_received) }));
}

export async function getMismatches(pool: Pool): Promise<MismatchRow[]> {
  const { rows } = await pool.query(MISMATCHES_SQL);
  return rows.map((r) => ({
    lastReceivedOn: d(r.last_received_on), poNumber: r.po_number, supplier: r.supplier, sku: r.sku, product: r.product,
    qtyOrdered: n(r.qty_ordered), qtyReceived: n(r.qty_received), qtyDifference: n(r.qty_difference),
    qtyDamaged: n(r.qty_damaged), status: r.status,
  }));
}
