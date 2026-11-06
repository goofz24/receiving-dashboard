import type { Pool } from "pg";
import {
  ASSET_EVENTS_SQL, ASSETS_SQL, DEVICE_HEALTH_SQL, IT_KPI_SQL, LICENSES_SQL, NEW_HIRES_SQL,
  OFFBOARDING_SQL, REFRESH_PLAN_SQL, STATUS_BY_CATEGORY_SQL, WARRANTY_SQL,
} from "./itam-queries";

// Same idea as data.ts: Postgres sends counts and money as strings, and
// dates as "YYYY-MM-DD" text (see db.ts); we turn them into plain values.
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? null : String(v));
const b = (v: unknown) => (v === null || v === undefined ? null : Boolean(v));

export type AssetStatus = "ordered" | "in_stock" | "deployed" | "in_repair" | "lost" | "retired" | "disposed";
export type AssetCategory = "laptop" | "desktop" | "monitor" | "phone" | "tablet" | "dock" | "printer";

export type ItKpis = {
  activeAssets: number; deployed: number; inStock: number; inRepair: number; onOrder: number; valueInUse: number;
  warrantyEnding90d: number; pastUsefulLife: number; withLeavers: number; personalNoOwner: number;
  bitlockerOff: number; notChecked30d: number;
};
export type StatusCountRow = { category: AssetCategory; status: AssetStatus; assets: number };
export type OffboardingRow = {
  employeeId: number; fullName: string; email: string; department: string; title: string; leftOn: string; daysSinceLeft: number;
  devices: number; deviceList: string | null; deviceValue: number; seats: number; seatList: string | null; seatCostPerYear: number;
};
export type NewHireRow = {
  employeeId: number; fullName: string; department: string; title: string; startedOn: string; daysSinceStart: number;
  devices: number; laptops: number; deviceList: string | null;
};
export type AssetRow = {
  assetId: number; assetTag: string; serialNumber: string; category: AssetCategory; manufacturer: string; modelName: string;
  status: AssetStatus; statusSince: string; assignedTo: string | null; department: string | null; ownerLeftOn: string | null;
  location: string; purchasedOn: string; purchaseCost: number; warrantyEndsOn: string; warrantyDaysLeft: number;
  refreshDueOn: string; ageMonths: number; vendor: string; invoiceNumber: string;
};
export type AssetEventRow = {
  assetId: number; eventId: number; eventOn: string; eventType: string; employee: string | null; doneBy: string; note: string | null;
};
export type WarrantyRow = {
  assetId: number; assetTag: string; category: AssetCategory; manufacturer: string; modelName: string; status: AssetStatus;
  assignedTo: string | null; location: string; purchasedOn: string; purchaseCost: number; warrantyEndsOn: string;
  warrantyDaysLeft: number; refreshDueOn: string; refreshDaysLeft: number; ageMonths: number; usefulLifeMonths: number;
};
export type RefreshBucketRow = { bucket: string; quarterStart: string | null; assets: number; replacementCost: number };
export type DeviceHealthRow = {
  assetId: number; assetTag: string; category: AssetCategory; manufacturer: string; modelName: string;
  assignedTo: string | null; department: string | null; checkedOn: string | null; daysSinceCheck: number | null;
  osVersion: string | null; bitlockerOn: boolean | null; diskFreePct: number | null; pendingUpdates: number | null;
  flagBitlocker: boolean; flagLowDisk: boolean; flagUpdates: boolean; flagNotChecked: boolean;
};
export type LicenseRow = {
  licenseId: number; product: string; vendor: string; seatsOwned: number; seatsUsed: number; seatsWithLeavers: number;
  seatsFree: number; costPerSeatYear: number; costPerYear: number; wastePerYear: number; renewsOn: string; renewsInDays: number;
};

export async function getItKpis(pool: Pool): Promise<ItKpis> {
  const { rows: [r] } = await pool.query(IT_KPI_SQL);
  return {
    activeAssets: n(r.active_assets), deployed: n(r.deployed), inStock: n(r.in_stock), inRepair: n(r.in_repair),
    onOrder: n(r.on_order), valueInUse: n(r.value_in_use), warrantyEnding90d: n(r.warranty_ending_90d),
    pastUsefulLife: n(r.past_useful_life), withLeavers: n(r.with_leavers), personalNoOwner: n(r.personal_no_owner),
    bitlockerOff: n(r.bitlocker_off), notChecked30d: n(r.not_checked_30d),
  };
}

export async function getStatusByCategory(pool: Pool): Promise<StatusCountRow[]> {
  const { rows } = await pool.query(STATUS_BY_CATEGORY_SQL);
  return rows.map((r) => ({ category: r.category, status: r.status, assets: n(r.assets) }));
}

export async function getOffboarding(pool: Pool): Promise<OffboardingRow[]> {
  const { rows } = await pool.query(OFFBOARDING_SQL);
  return rows.map((r) => ({
    employeeId: n(r.employee_id), fullName: r.full_name, email: r.email, department: r.department, title: r.title,
    leftOn: d(r.left_on)!, daysSinceLeft: n(r.days_since_left), devices: n(r.devices), deviceList: r.device_list,
    deviceValue: n(r.device_value), seats: n(r.seats), seatList: r.seat_list, seatCostPerYear: n(r.seat_cost_per_year),
  }));
}

export async function getNewHires(pool: Pool): Promise<NewHireRow[]> {
  const { rows } = await pool.query(NEW_HIRES_SQL);
  return rows.map((r) => ({
    employeeId: n(r.employee_id), fullName: r.full_name, department: r.department, title: r.title, startedOn: d(r.started_on)!,
    daysSinceStart: n(r.days_since_start), devices: n(r.devices), laptops: n(r.laptops), deviceList: r.device_list,
  }));
}

export async function getAssets(pool: Pool): Promise<AssetRow[]> {
  const { rows } = await pool.query(ASSETS_SQL);
  return rows.map((r) => ({
    assetId: n(r.asset_id), assetTag: r.asset_tag, serialNumber: r.serial_number, category: r.category, manufacturer: r.manufacturer,
    modelName: r.model_name, status: r.status, statusSince: d(r.status_since)!, assignedTo: r.assigned_to, department: r.department,
    ownerLeftOn: d(r.owner_left_on), location: r.location, purchasedOn: d(r.purchased_on)!, purchaseCost: n(r.purchase_cost),
    warrantyEndsOn: d(r.warranty_ends_on)!, warrantyDaysLeft: n(r.warranty_days_left), refreshDueOn: d(r.refresh_due_on)!,
    ageMonths: n(r.age_months), vendor: r.vendor, invoiceNumber: r.invoice_number,
  }));
}

export async function getAssetEvents(pool: Pool): Promise<AssetEventRow[]> {
  const { rows } = await pool.query(ASSET_EVENTS_SQL);
  return rows.map((r) => ({
    assetId: n(r.asset_id), eventId: n(r.event_id), eventOn: d(r.event_on)!, eventType: r.event_type,
    employee: r.employee, doneBy: r.done_by, note: r.note,
  }));
}

export async function getWarranty(pool: Pool): Promise<WarrantyRow[]> {
  const { rows } = await pool.query(WARRANTY_SQL);
  return rows.map((r) => ({
    assetId: n(r.asset_id), assetTag: r.asset_tag, category: r.category, manufacturer: r.manufacturer, modelName: r.model_name,
    status: r.status, assignedTo: r.assigned_to, location: r.location, purchasedOn: d(r.purchased_on)!, purchaseCost: n(r.purchase_cost),
    warrantyEndsOn: d(r.warranty_ends_on)!, warrantyDaysLeft: n(r.warranty_days_left), refreshDueOn: d(r.refresh_due_on)!,
    refreshDaysLeft: n(r.refresh_days_left), ageMonths: n(r.age_months), usefulLifeMonths: n(r.useful_life_months),
  }));
}

export async function getRefreshPlan(pool: Pool): Promise<RefreshBucketRow[]> {
  const { rows } = await pool.query(REFRESH_PLAN_SQL);
  return rows.map((r) => ({ bucket: r.bucket, quarterStart: d(r.quarter_start), assets: n(r.assets), replacementCost: n(r.replacement_cost) }));
}

export async function getDeviceHealth(pool: Pool): Promise<DeviceHealthRow[]> {
  const { rows } = await pool.query(DEVICE_HEALTH_SQL);
  return rows.map((r) => ({
    assetId: n(r.asset_id), assetTag: r.asset_tag, category: r.category, manufacturer: r.manufacturer, modelName: r.model_name,
    assignedTo: r.assigned_to, department: r.department, checkedOn: d(r.checked_on), daysSinceCheck: nn(r.days_since_check),
    osVersion: r.os_version, bitlockerOn: b(r.bitlocker_on), diskFreePct: nn(r.disk_free_pct), pendingUpdates: nn(r.pending_updates),
    flagBitlocker: Boolean(r.flag_bitlocker), flagLowDisk: Boolean(r.flag_low_disk), flagUpdates: Boolean(r.flag_updates),
    flagNotChecked: Boolean(r.flag_not_checked),
  }));
}

export async function getLicenses(pool: Pool): Promise<LicenseRow[]> {
  const { rows } = await pool.query(LICENSES_SQL);
  return rows.map((r) => ({
    licenseId: n(r.license_id), product: r.product, vendor: r.vendor, seatsOwned: n(r.seats_owned), seatsUsed: n(r.seats_used),
    seatsWithLeavers: n(r.seats_with_leavers), seatsFree: n(r.seats_free), costPerSeatYear: n(r.cost_per_seat_year),
    costPerYear: n(r.cost_per_year), wastePerYear: n(r.waste_per_year), renewsOn: d(r.renews_on)!, renewsInDays: n(r.renews_in_days),
  }));
}

export type ItamData = {
  itKpis: ItKpis; statusByCategory: StatusCountRow[]; offboarding: OffboardingRow[]; newHires: NewHireRow[];
  assets: AssetRow[]; assetEvents: AssetEventRow[]; warranty: WarrantyRow[]; refreshPlan: RefreshBucketRow[];
  deviceHealth: DeviceHealthRow[]; licenses: LicenseRow[];
};

export async function getItamData(pool: Pool): Promise<ItamData> {
  const [itKpis, statusByCategory, offboarding, newHires, assets, assetEvents, warranty, refreshPlan, deviceHealth, licenses] = await Promise.all([
    getItKpis(pool), getStatusByCategory(pool), getOffboarding(pool), getNewHires(pool), getAssets(pool),
    getAssetEvents(pool), getWarranty(pool), getRefreshPlan(pool), getDeviceHealth(pool), getLicenses(pool),
  ]);
  return { itKpis, statusByCategory, offboarding, newHires, assets, assetEvents, warranty, refreshPlan, deviceHealth, licenses };
}
