"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DashboardData } from "@/lib/data";
import { fmtDay, fmtInt } from "@/lib/format";
import { followUpEmail, greeting, initials, MANAGER_NAME, supplierColor, weeklyTotals } from "@/lib/view-helpers";
import { SupplierDonut, WeeklyBars } from "../charts";
import { Icon } from "../icons";
import { KpiCard, Seg, SqlButton, Trend, useUi, rise } from "../ui";


export function Overview({ data, go }: { data: DashboardData; go: (page: string) => void }) {
  const { kpis: k } = data;
  const ui = useUi();
  const [range, setRange] = useState(12);
  const [picked, setPicked] = useState<number | null>(null);
  // Greeting and date use the viewer's clock, so they are set after the page loads.
  const [hello, setHello] = useState({ greet: "Welcome back", today: "" });
  useEffect(() => {
    const now = new Date();
    setHello({ greet: greeting(now.getHours()), today: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) });
  }, []);

  const weeks = useMemo(() => weeklyTotals(data.weeks, range, picked), [data.weeks, range, picked]);
  const units = weeks.reduce((a, w) => a + w.units, 0), deliveries = weeks.reduce((a, w) => a + w.deliveries, 0);
  const pickedName = data.supplierValue.find((s) => s.supplierId === picked)?.supplier;
  const overdue = data.orderLines.filter((l) => l.status === "overdue").sort((a, b) => b.daysPastDue - a.daysPastDue).slice(0, 5);
  const latest = data.deliveries.slice(0, 5);

  return (
    <>
      <div {...rise(0, "head")}>
        <div>
          <h1>{hello.greet}, {MANAGER_NAME}</h1>
          <p>{hello.today && <>{hello.today} · </>}<b>{k.overdueLines} overdue lines</b> and <b>{k.mismatchedLines30d} count mismatches</b> need a look</p>
        </div>
        <div className="actions">
          <a className="btn" href="#deliveries"><Icon name="truck" />Deliveries</a>
          <a className="btn solid" href="#ask"><Icon name="sparkles" />Ask AI</a>
        </div>
      </div>

      <div {...rise(1, "grid-top")}>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Units received</h2>
              <p className="sub">{fmtInt(units)} units from {deliveries} deliveries in the last {range} weeks{picked ? "" : ", all suppliers"}</p>
            </div>
            <div className="actions">
              <Seg label="Weeks to show" value={range} onChange={setRange}
                options={[{ value: 4, label: "4 weeks" }, { value: 8, label: "8 weeks" }, { value: 12, label: "12 weeks" }]} />
              <SqlButton k="weekly" />
            </div>
          </div>
          <WeeklyBars key={range} weeks={weeks} />
          <div className="chart-foot">
            {picked && pickedName && (
              <span className="filter-chip">
                <i className="sw" style={{ background: supplierColor(picked) }} />{pickedName}
                <button type="button" aria-label="Clear supplier filter" onClick={() => setPicked(null)}><Icon name="x" /></button>
              </span>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div><h2>Value received by supplier</h2><p className="sub">Last 12 weeks. Click a supplier to filter the chart.</p></div>
            <SqlButton k="supplierValue" />
          </div>
          <SupplierDonut slices={data.supplierValue.map((s) => ({ id: s.supplierId, name: s.supplier, value: s.valueReceived }))}
            picked={picked} onPick={setPicked} />
        </section>
      </div>

      <div {...rise(2, "kpis")}>
        <KpiCard icon="truck" value={k.deliveries7d} label="Deliveries" hint="last 7 days vs the 7 before" extra={<Trend now={k.deliveries7d} prev={k.deliveriesPrev7d} />} />
        <KpiCard icon="box" value={k.units7d} label="Units received" hint="last 7 days vs the 7 before" extra={<Trend now={k.units7d} prev={k.unitsPrev7d} />} />
        <KpiCard icon="diff" value={k.mismatchedLines30d} label="Count mismatches" hint="short or over, last 30 days"
          extra={k.mismatchedLines30d > 0 && <span className="pill-s st-over">Check</span>} />
        <KpiCard icon="clock" value={k.overdueLines} label="Overdue order lines" hint="past their expected date"
          extra={k.overdueLines > 0 && <span className="pill-s st-overdue">Follow up</span>} />
        <KpiCard icon="open" value={k.openOrders} label="Open orders" hint={`${k.awaitingLines} lines still on the way`} />
        <KpiCard icon="percent" value={k.fillRatePct} format="pct" label="Fill rate" hint="ordered units that arrived, on orders already due" />
        <KpiCard icon="damage" value={k.damaged30d} label="Damaged units" hint="last 30 days vs the 30 before" extra={<Trend now={k.damaged30d} prev={k.damagedPrev30d} upIsGood={false} />} />
        <KpiCard icon="dollar" value={k.value30d} format="money" label="Value received" hint="last 30 days vs the 30 before" extra={<Trend now={k.value30d} prev={k.valuePrev30d} />} />
      </div>
      <div {...rise(3, "kpi-sql")}><button type="button" className="link-btn" onClick={() => ui.showSql("kpis")}><Icon name="code" />Show the SQL for these numbers</button></div>

      <div {...rise(4, "two")}>
        <section className="card">
          <div className="card-head">
            <div><h2>Oldest overdue lines</h2><p className="sub">Copy a ready-to-send follow-up for the supplier.</p></div>
            <SqlButton k="orders" />
          </div>
          <div className="list">
            {overdue.length === 0 && <p className="empty">Nothing is overdue.</p>}
            {overdue.map((l) => (
              <div className="li" key={l.poLineId}>
                <span className="initials" style={{ background: supplierColor(l.supplierId) }}>{initials(l.supplier)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{l.product}</div>
                  <div className="s">{l.poNumber} · {l.supplier} · <span className="late">{l.daysPastDue} {l.daysPastDue === 1 ? "day" : "days"} late</span></div>
                </div>
                <button type="button" className="btn sm" onClick={() => ui.copy(followUpEmail({ ...l, expectedOn: l.expectedOn }, "overdue", fmtDay), `Follow-up for ${l.supplier} copied`)}>
                  <Icon name="mail" />Copy
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div><h2>Latest deliveries</h2><p className="sub">Counted at the dock.</p></div>
            <SqlButton k="deliveries" />
          </div>
          <div className="list">
            {latest.map((r) => (
              <button type="button" className="li" key={r.receiptId} onClick={() => go(`deliveries`)}>
                <span className="initials" style={{ background: personColor(r.receivedBy) }}>{initials(r.receivedBy)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{r.poNumber} · {r.supplier}</div>
                  <div className="s">{fmtDay(r.receivedOn)} · {r.lines} lines · {r.receivedBy}</div>
                </div>
                <b className="tnum">{fmtInt(r.units)} <span className="muted">units</span></b>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function personColor(name: string) {
  return ["#0e8fc9", "#7c5cf0", "#e0702c", "#1f9e6a"][[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 4];
}
