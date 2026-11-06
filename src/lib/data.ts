import type { Pool } from "pg";
import {
  DELIVERIES_SQL, DELIVERY_LINES_SQL, KPI_SQL, MISMATCHES_SQL, ORDER_LINES_SQL,
  SUPPLIER_HEALTH_SQL, SUPPLIER_TOTALS_SQL, SUPPLIER_VALUE_SQL, WEEKLY_UNITS_SQL,
} from "./queries";
import { getItamData, type ItamData } from "./itam-data";

// Postgres sends big numbers (count, sum, numeric) as strings so nothing
// is lost. We turn them into JavaScript numbers here; these values are
// small enough to be safe. Dates arrive as "YYYY-MM-DD" text (see db.ts).
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? null : String(v));

export type LineStatus = "awaiting" | "overdue" | "short" | "over" | "complete";

export type Kpis = {
  today: string;
  deliveries7d: number; deliveriesPrev7d: number; units7d: number; unitsPrev7d: number;
  damaged30d: number; damagedPrev30d: number; value30d: number; valuePrev30d: number;
  mismatchedLines30d: number; overdueLines: number; awaitingLines: number; openOrders: number; fillRatePct: number;
};
export type WeekRow = { weekStart: string; supplierId: number; deliveries: number; unitsReceived: number };
export type SupplierValueRow = { supplierId: number; supplier: string; valueReceived: number };
export type DeliveryRow = {
  receiptId: number; receivedOn: string; poNumber: string; supplierId: number; supplier: string;
  packingSlipNo: string; receivedBy: string; source: string; lines: number; units: number; damaged: number; value: number;
};
export type DeliveryLineRow = {
  receiptId: number; sku: string; product: string; qtyOrdered: number; qtyReceived: number; qtyDamaged: number; status: LineStatus;
};
export type OrderLineRow = {
  poLineId: number; poNumber: string; supplierId: number; supplier: string; sku: string; product: string;
  expectedOn: string; daysPastDue: number; qtyOrdered: number; qtyReceived: number; qtyDamaged: number; status: LineStatus;
};
export type SupplierRow = {
  supplierId: number; supplier: string; city: string; leadTimeDays: number; orders: number;
  unitsOrdered: number; unitsReceived: number; fillRatePct: number; valueReceived: number;
};
export type SupplierHealthRow = { supplierId: number; shortLines: number; overdueLines: number; onTimePct: number };
export type MismatchRow = {
  poLineId: number; lastReceivedOn: string | null; poNumber: string; supplierId: number; supplier: string; sku: string; product: string;
  qtyOrdered: number; qtyReceived: number; qtyDifference: number; qtyDamaged: number; unitCost: number; status: LineStatus;
};

export async function getKpis(pool: Pool): Promise<Kpis> {
  const { rows: [r] } = await pool.query(KPI_SQL);
  return {
    today: d(r.today)!,
    deliveries7d: n(r.deliveries_7d), deliveriesPrev7d: n(r.deliveries_prev_7d),
    units7d: n(r.units_7d), unitsPrev7d: n(r.units_prev_7d),
    damaged30d: n(r.damaged_30d), damagedPrev30d: n(r.damaged_prev_30d),
    value30d: n(r.value_30d), valuePrev30d: n(r.value_prev_30d),
    mismatchedLines30d: n(r.mismatched_lines_30d), overdueLines: n(r.overdue_lines),
    awaitingLines: n(r.awaiting_lines), openOrders: n(r.open_orders), fillRatePct: n(r.fill_rate_pct),
  };
}

export async function getWeeklyUnits(pool: Pool): Promise<WeekRow[]> {
  const { rows } = await pool.query(WEEKLY_UNITS_SQL);
  return rows.map((r) => ({ weekStart: d(r.week_start)!, supplierId: n(r.supplier_id), deliveries: n(r.deliveries), unitsReceived: n(r.units_received) }));
}

export async function getSupplierValue(pool: Pool): Promise<SupplierValueRow[]> {
  const { rows } = await pool.query(SUPPLIER_VALUE_SQL);
  return rows.map((r) => ({ supplierId: n(r.supplier_id), supplier: r.supplier, valueReceived: n(r.value_received) }));
}

export async function getDeliveries(pool: Pool): Promise<DeliveryRow[]> {
  const { rows } = await pool.query(DELIVERIES_SQL);
  return rows.map((r) => ({
    receiptId: n(r.receipt_id), receivedOn: d(r.received_on)!, poNumber: r.po_number, supplierId: n(r.supplier_id), supplier: r.supplier,
    packingSlipNo: r.packing_slip_no, receivedBy: r.received_by, source: r.source,
    lines: n(r.lines), units: n(r.units), damaged: n(r.damaged), value: n(r.value),
  }));
}

export async function getDeliveryLines(pool: Pool): Promise<DeliveryLineRow[]> {
  const { rows } = await pool.query(DELIVERY_LINES_SQL);
  return rows.map((r) => ({
    receiptId: n(r.receipt_id), sku: r.sku, product: r.product, qtyOrdered: n(r.qty_ordered),
    qtyReceived: n(r.qty_received), qtyDamaged: n(r.qty_damaged), status: r.status,
  }));
}

export async function getOrderLines(pool: Pool): Promise<OrderLineRow[]> {
  const { rows } = await pool.query(ORDER_LINES_SQL);
  return rows.map((r) => ({
    poLineId: n(r.po_line_id), poNumber: r.po_number, supplierId: n(r.supplier_id), supplier: r.supplier, sku: r.sku, product: r.product,
    expectedOn: d(r.expected_on)!, daysPastDue: n(r.days_past_due), qtyOrdered: n(r.qty_ordered),
    qtyReceived: n(r.qty_received), qtyDamaged: n(r.qty_damaged), status: r.status,
  }));
}

export async function getSupplierTotals(pool: Pool): Promise<SupplierRow[]> {
  const { rows } = await pool.query(SUPPLIER_TOTALS_SQL);
  return rows.map((r) => ({
    supplierId: n(r.supplier_id), supplier: r.supplier, city: r.city, leadTimeDays: n(r.lead_time_days),
    orders: n(r.orders), unitsOrdered: n(r.units_ordered), unitsReceived: n(r.units_received),
    fillRatePct: n(r.fill_rate_pct), valueReceived: n(r.value_received),
  }));
}

export async function getSupplierHealth(pool: Pool): Promise<SupplierHealthRow[]> {
  const { rows } = await pool.query(SUPPLIER_HEALTH_SQL);
  return rows.map((r) => ({ supplierId: n(r.supplier_id), shortLines: n(r.short_lines), overdueLines: n(r.overdue_lines), onTimePct: n(r.on_time_pct) }));
}

export async function getMismatches(pool: Pool): Promise<MismatchRow[]> {
  const { rows } = await pool.query(MISMATCHES_SQL);
  return rows.map((r) => ({
    poLineId: n(r.po_line_id), lastReceivedOn: d(r.last_received_on), poNumber: r.po_number, supplierId: n(r.supplier_id),
    supplier: r.supplier, sku: r.sku, product: r.product, qtyOrdered: n(r.qty_ordered), qtyReceived: n(r.qty_received),
    qtyDifference: n(r.qty_difference), qtyDamaged: n(r.qty_damaged), unitCost: n(r.unit_cost), status: r.status,
  }));
}

export type DashboardData = {
  kpis: Kpis; weeks: WeekRow[]; supplierValue: SupplierValueRow[]; deliveries: DeliveryRow[]; deliveryLines: DeliveryLineRow[];
  orderLines: OrderLineRow[]; suppliers: SupplierRow[]; supplierHealth: SupplierHealthRow[]; mismatches: MismatchRow[];
  // null when the IT asset tables (sql/04 to 06) haven't been created yet
  itam: ItamData | null;
};

// Postgres error codes for "no such table", "no such schema" and
// "permission denied" (the tables exist but 06_itam_security.sql wasn't run).
const MISSING = new Set(["42P01", "3F000", "42501"]);

// The IT pages are optional: if their tables don't exist yet, the receiving
// pages still work and the IT pages say how to set them up.
async function getItamIfReady(pool: Pool): Promise<ItamData | null> {
  try {
    return await getItamData(pool);
  } catch (err) {
    if (MISSING.has((err as { code?: string }).code ?? "")) return null;
    throw err;
  }
}

// Runs every query at once. The pool has at most 5 connections, so they queue nicely.
export async function getDashboardData(pool: Pool): Promise<DashboardData> {
  const [kpis, weeks, supplierValue, deliveries, deliveryLines, orderLines, suppliers, supplierHealth, mismatches, itam] = await Promise.all([
    getKpis(pool), getWeeklyUnits(pool), getSupplierValue(pool), getDeliveries(pool), getDeliveryLines(pool),
    getOrderLines(pool), getSupplierTotals(pool), getSupplierHealth(pool), getMismatches(pool), getItamIfReady(pool),
  ]);
  return { kpis, weeks, supplierValue, deliveries, deliveryLines, orderLines, suppliers, supplierHealth, mismatches, itam };
}
