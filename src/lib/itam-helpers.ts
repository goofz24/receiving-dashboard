// Small pure helpers for the IT asset pages. No database, no React, so they are easy to test.
import type { AssetCategory, AssetStatus, OffboardingRow } from "./itam-data";
import { MANAGER_NAME } from "./view-helpers";

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ordered: "On order", in_stock: "In stock", deployed: "Deployed", in_repair: "In repair",
  lost: "Lost", retired: "Retired", disposed: "Disposed",
};
// Order used for charts and tabs: the life of a device, start to end.
export const ASSET_STATUSES: AssetStatus[] = ["ordered", "in_stock", "deployed", "in_repair", "lost", "retired", "disposed"];

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  laptop: "Laptops", desktop: "Desktops", monitor: "Monitors", phone: "Phones", tablet: "Tablets", dock: "Docks", printer: "Printers",
};

export const EVENT_LABEL: Record<string, string> = {
  ordered: "Ordered", received: "Received at the dock", deployed: "Handed out", returned: "Handed back",
  repair_out: "Sent to repair", repair_back: "Back from repair", lost: "Reported lost", retired: "Retired", disposed: "Disposed of",
};

// "Warranty ends in 21 days" / "Out of warranty for 3 months".
export function warrantyText(daysLeft: number) {
  if (daysLeft > 60) return `${Math.round(daysLeft / 30.44)} months of warranty left`;
  if (daysLeft >= 0) return daysLeft === 0 ? "Warranty ends today" : `Warranty ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
  const ago = -daysLeft;
  return ago > 60 ? `Out of warranty for ${Math.round(ago / 30.44)} months` : `Out of warranty for ${ago} ${ago === 1 ? "day" : "days"}`;
}

// Years and months, for asset age: 50 -> "4 yr 2 mo".
export function ageText(months: number) {
  const y = Math.floor(months / 12), m = months % 12;
  if (!y) return `${m} mo`;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

// The status counts come one row per (type, status). Turn them into one
// row per type with a count for each status, for the stacked bars.
export function statusMatrix(rows: { category: AssetCategory; status: AssetStatus; assets: number }[]) {
  const out = new Map<AssetCategory, Record<AssetStatus, number> & { total: number }>();
  for (const r of rows) {
    const row = out.get(r.category) ?? { ordered: 0, in_stock: 0, deployed: 0, in_repair: 0, lost: 0, retired: 0, disposed: 0, total: 0 };
    row[r.status] += r.assets;
    row.total += r.assets;
    out.set(r.category, row);
  }
  return [...out].map(([category, counts]) => ({ category, ...counts })).sort((a, b) => b.total - a.total);
}

// A ready-to-paste help desk ticket for one person who left with company
// things. The dashboard never creates the ticket itself; a person does.
export function offboardingTicket(p: OffboardingRow, fmtDay: (iso: string | null) => string) {
  const lines: string[] = [];
  if (p.devices) for (const dev of (p.deviceList ?? "").split("; ").filter(Boolean)) lines.push(`- Recover device: ${dev}`);
  if (p.seats) for (const s of (p.seatList ?? "").split("; ").filter(Boolean)) lines.push(`- Remove license seat: ${s}`);
  const money = [
    p.deviceValue ? `devices bought for $${Math.round(p.deviceValue).toLocaleString("en-US")}` : "",
    p.seatCostPerYear ? `seats costing $${Math.round(p.seatCostPerYear).toLocaleString("en-US")} a year` : "",
  ].filter(Boolean).join(" and ");
  return [
    `Title: Offboarding follow-up: ${p.fullName} (${p.department})`,
    `Priority: ${p.devices ? "High" : "Medium"}`,
    "",
    `${p.fullName} (${p.title}, ${p.email}) left on ${fmtDay(p.leftOn)}, ${p.daysSinceLeft} days ago. These are still assigned to them${money ? ` (${money})` : ""}:`,
    "",
    ...lines,
    "",
    "Steps:",
    ...(p.devices ? ["1. Contact the person or their former manager and arrange the return (prepaid label for remote staff).",
      "2. When it's back: wipe the device, check it for damage, and mark it returned in the asset tracker."] : []),
    `${p.devices ? "3" : "1"}. Remove the license seats and confirm the account is disabled.`,
    "",
    `Opened by ${MANAGER_NAME} from the IT asset dashboard.`,
  ].join("\n");
}
