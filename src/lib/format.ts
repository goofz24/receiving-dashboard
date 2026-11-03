export const fmtInt = (v: number) => v.toLocaleString("en-US");
export const fmtMoney = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export function fmtDay(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
