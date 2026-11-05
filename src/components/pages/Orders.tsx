"use client";

import { useState, type CSSProperties } from "react";
import type { DashboardData, LineStatus } from "@/lib/data";
import { fmtDay } from "@/lib/format";
import { Prog } from "../charts";
import { Icon } from "../icons";
import { KpiCard, Seg, SqlButton, StatusPill, SupTag, useUi, rise } from "../ui";

type Tab = LineStatus | "all";

export function Orders({ data, query, setQuery, tab, setTab }: {
  data: DashboardData; query: string; setQuery: (q: string) => void; tab: Tab; setTab: (t: Tab) => void;
}) {
  const ui = useUi();
  const [shown, setShown] = useState(25);
  const k = data.kpis;
  const count = (t: Tab) => (t === "all" ? data.orderLines.length : data.orderLines.filter((l) => l.status === t).length);
  const q = query.trim().toLowerCase();
  // the SQL already sorts by status, then expected date
  const rows = data.orderLines.filter((l) => (tab === "all" || l.status === tab) && (!q || [l.poNumber, l.supplier, l.product, l.sku].join(" ").toLowerCase().includes(q)));

  const copyOverdue = () => {
    const bySupplier = new Map<string, string[]>();
    for (const l of data.orderLines.filter((x) => x.status === "overdue")) {
      bySupplier.set(l.supplier, [...(bySupplier.get(l.supplier) ?? []), `- ${l.poNumber}: ${l.qtyOrdered} × ${l.product} (${l.sku}), due ${fmtDay(l.expectedOn)}, ${l.daysPastDue} days late`]);
    }
    ui.copy("Overdue order lines\n\n" + [...bySupplier].map(([s, ls]) => `To: ${s}\n${ls.join("\n")}`).join("\n\n"), "Overdue list copied");
  };

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Purchase orders</h1><p>Every order line and where it stands, from the <b>po_line_status</b> view.</p></div>
        <div className="actions"><button type="button" className="btn solid" onClick={copyOverdue} disabled={!k.overdueLines}><Icon name="mail" />Copy all overdue follow-ups</button></div>
      </div>
      <div {...rise(1, "kpis")}>
        <KpiCard icon="open" value={k.openOrders} label="Open orders" hint="with lines still to arrive" />
        <KpiCard icon="clock" value={k.overdueLines} label="Overdue lines" hint="past their expected date" />
        <KpiCard icon="truck" value={k.awaitingLines} label="Lines on the way" hint="not due yet" />
        <KpiCard icon="percent" value={k.fillRatePct} format="pct" label="Fill rate" hint="on orders already due" />
      </div>
      <section {...rise(2, "card")}>
        <div className="toolbar">
          <div className="seg-wrap">
            <Seg label="Line status" value={tab} onChange={(t) => { setTab(t); setShown(25); }} options={(["overdue", "awaiting", "short", "over", "complete", "all"] as Tab[]).map((t) => ({
              value: t, label: t === "all" ? "All" : t[0].toUpperCase() + t.slice(1), count: count(t),
            }))} />
          </div>
          <div className="toolbar-right">
            <label className="field" htmlFor="oq"><Icon name="search" />
              <input id="oq" value={query} onChange={(e) => { setQuery(e.target.value); setShown(25); }} placeholder="PO, supplier, product or SKU" />
            </label>
            <SqlButton k="orders" />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Supplier</th><th>Product</th><th>Expected</th><th>Received</th><th className="r">Count</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty">No order lines match.</td></tr>}
              {rows.slice(0, shown).map((l, i) => (
                <tr key={l.poLineId} className="rise" style={{ ["--i" as string]: Math.min(i, 20) } as CSSProperties}>
                  <td><b>{l.poNumber}</b></td>
                  <td><SupTag id={l.supplierId} name={l.supplier} /></td>
                  <td>{l.product}<span className="sku">{l.sku}</span></td>
                  <td>{fmtDay(l.expectedOn)}<br />
                    {l.status === "overdue" ? <span className="late">{l.daysPastDue} {l.daysPastDue === 1 ? "day" : "days"} late</span>
                      : l.daysPastDue < 0 ? <span className="muted small">in {-l.daysPastDue} {l.daysPastDue === -1 ? "day" : "days"}</span> : null}
                  </td>
                  <td><Prog fraction={l.qtyReceived / l.qtyOrdered} tone={l.status} delay={Math.min(i, 20) * 25} /></td>
                  <td className="r tnum"><b>{l.qtyReceived}</b><span className="muted"> / {l.qtyOrdered}</span></td>
                  <td><StatusPill status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown && <div className="more"><button type="button" className="btn sm" onClick={() => setShown((s) => s + 25)}>Show more ({rows.length - shown} left)</button></div>}
      </section>
    </>
  );
}
