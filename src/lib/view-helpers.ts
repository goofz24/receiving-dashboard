// Small pure helpers for the page. No database, no React, so they are easy to test.
import type { LineStatus, WeekRow } from "./data";

export const MANAGER_NAME = "Mel";

const SUPPLIER_COLORS = ["#2f8cf0", "#f0642f", "#22b36b", "#f2a81d", "#8b5cf6", "#14b8c4"];
export const supplierColor = (supplierId: number) => SUPPLIER_COLORS[(Math.max(1, supplierId) - 1) % SUPPLIER_COLORS.length];

export function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

// Change against the previous period, as a whole percent. null when there is nothing to compare with.
export function trendPct(now: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round((100 * (now - prev)) / prev);
}

// Round chart ticks: 0, 200, 400, 600 instead of 0, 137, 274...
export function niceScale(max: number, steps = 4) {
  const safe = Math.max(10, max);
  const raw = safe / steps;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
  const top = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

export type WeekTotal = { weekStart: string; units: number; deliveries: number };

// The SQL returns one row per week per supplier. Add them up for the chart,
// for one supplier or for all, and keep the last `weeks` weeks.
export function weeklyTotals(rows: WeekRow[], weeks: number, supplierId: number | null): WeekTotal[] {
  const byWeek = new Map<string, WeekTotal>();
  for (const r of rows) {
    if (supplierId !== null && r.supplierId !== supplierId) continue;
    const w = byWeek.get(r.weekStart) ?? { weekStart: r.weekStart, units: 0, deliveries: 0 };
    w.units += r.unitsReceived;
    w.deliveries += r.deliveries;
    byWeek.set(r.weekStart, w);
  }
  if (supplierId !== null) {
    // keep empty weeks for a supplier too
    for (const r of rows) if (!byWeek.has(r.weekStart)) byWeek.set(r.weekStart, { weekStart: r.weekStart, units: 0, deliveries: 0 });
  }
  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-weeks);
}

export function initials(name: string) {
  return name.replace(/[^A-Za-z. ]/g, "").split(/[ .]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export const STATUS_LABEL: Record<LineStatus | "damaged", string> = {
  overdue: "Overdue", short: "Short", over: "Over", awaiting: "Awaiting", complete: "Complete", damaged: "Damaged",
};

export type FollowUpKind = "overdue" | "short" | "over" | "damaged";
export type FollowUpLine = {
  poNumber: string; supplier: string; sku: string; product: string;
  qtyOrdered: number; qtyReceived: number; qtyDamaged: number;
  receivedOn?: string | null; expectedOn?: string | null;
};

// A ready-to-send email to the supplier. The dashboard never sends anything itself.
export function followUpEmail(l: FollowUpLine, kind: FollowUpKind, fmtDay: (iso: string | null) => string) {
  const when = l.receivedOn ? ` (delivered ${fmtDay(l.receivedOn)})` : "";
  const item = `${l.product} (${l.sku})`;
  let body: string;
  if (kind === "overdue") body = `We're still waiting on ${l.qtyOrdered} × ${item} on ${l.poNumber}. It was due ${fmtDay(l.expectedOn ?? null)}. Could you send a new ship date?`;
  else if (kind === "short") body = `On ${l.poNumber}${when}, we ordered ${l.qtyOrdered} × ${item} and counted ${l.qtyReceived}, so we're ${l.qtyOrdered - l.qtyReceived} short. Could you confirm when the rest will ship, or send a credit?`;
  else if (kind === "over") body = `On ${l.poNumber}${when}, we ordered ${l.qtyOrdered} × ${item} but received ${l.qtyReceived}. Should we send the extra ${l.qtyReceived - l.qtyOrdered} back, or will you invoice them?`;
  else body = `On ${l.poNumber}${when}, ${l.qtyDamaged} × ${item} arrived damaged. Could you send replacements or a credit?`;
  return `Subject: ${l.poNumber} follow-up\n\nHi ${l.supplier} team,\n\n${body}\n\nThank you,\n${MANAGER_NAME}\nReceiving`;
}

// CSV text for "Copy as CSV". Quotes any value with a comma or quote in it.
export function toCsv(header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
