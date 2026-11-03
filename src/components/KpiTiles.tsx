import type { Kpis } from "@/lib/data";
import { fmtInt } from "@/lib/format";

export function KpiTiles({ kpis }: { kpis: Kpis }) {
  const tiles = [
    { label: "Deliveries, last 7 days", value: kpis.deliveries7d },
    { label: "Units received, last 7 days", value: kpis.units7d },
    { label: "Count mismatches, last 30 days", value: kpis.mismatchedLines30d, flag: kpis.mismatchedLines30d > 0 ? "Check" : undefined },
    { label: "Overdue order lines", value: kpis.overdueLines, flag: kpis.overdueLines > 0 ? "Follow up" : undefined },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div className="kpi" key={t.label}>
          <div className="kpi-label">{t.label}</div>
          <div className="kpi-value">{fmtInt(t.value)}</div>
          {t.flag && <div className="badge badge-warn"><span aria-hidden>!</span> {t.flag}</div>}
        </div>
      ))}
    </div>
  );
}
