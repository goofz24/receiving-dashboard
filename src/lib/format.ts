export const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
export const fmtMoney = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
export const fmtMoney2 = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`);

// Dates come from Postgres as "YYYY-MM-DD". Read them as calendar days (UTC)
// so the label never shifts by a day because of the viewer's time zone.
export function fmtDay(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const FORMATS = { int: fmtInt, money: fmtMoney, k: fmtK, pct: fmtPct } as const;
export type FormatName = keyof typeof FORMATS;
