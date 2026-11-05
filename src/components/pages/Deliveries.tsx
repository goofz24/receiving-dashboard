"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import type { DashboardData, DeliveryLineRow } from "@/lib/data";
import { fmtDay, fmtInt } from "@/lib/format";
import { initials, toCsv } from "@/lib/view-helpers";
import { Icon } from "../icons";
import { KpiCard, Seg, SqlButton, StatusPill, SupTag, useUi, rise } from "../ui";
import { personColor } from "./Overview";

type Tab = "all" | "week" | "issues";

export function Deliveries({ data }: { data: DashboardData }) {
  const ui = useUi();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(15);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const linesByReceipt = useMemo(() => {
    const m = new Map<number, DeliveryLineRow[]>();
    for (const l of data.deliveryLines) m.set(l.receiptId, [...(m.get(l.receiptId) ?? []), l]);
    return m;
  }, [data.deliveryLines]);
  const weekAgo = addDays(data.kpis.today, -6);
  const hasIssue = (id: number) => (linesByReceipt.get(id) ?? []).some((l) => l.qtyDamaged > 0 || l.status === "short" || l.status === "over");
  const tabs: Record<Tab, typeof data.deliveries> = {
    all: data.deliveries,
    week: data.deliveries.filter((r) => r.receivedOn >= weekAgo),
    issues: data.deliveries.filter((r) => hasIssue(r.receiptId)),
  };
  const q = query.trim().toLowerCase();
  const rows = tabs[tab].filter((r) => !q || [r.poNumber, r.supplier, r.packingSlipNo, r.receivedBy].join(" ").toLowerCase().includes(q));
  const sum = (f: (r: (typeof data.deliveries)[number]) => number) => data.deliveries.reduce((a, r) => a + f(r), 0);
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const copyCsv = () => ui.copy(
    toCsv(["received_on", "po_number", "supplier", "packing_slip_no", "received_by", "lines", "units", "damaged", "value"],
      data.deliveries.map((r) => [r.receivedOn, r.poNumber, r.supplier, r.packingSlipNo, r.receivedBy, r.lines, r.units, r.damaged, r.value.toFixed(2)])),
    "CSV copied. Paste it into Excel or Google Sheets.");

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Deliveries</h1><p>Every delivery counted at the dock, newest first. Click one to see what was on it.</p></div>
        <div className="actions">
          <button type="button" className="btn" onClick={copyCsv}><Icon name="copy" />Copy as CSV</button>
          <a className="btn solid" href="#mismatches"><Icon name="alert" />Review mismatches</a>
        </div>
      </div>
      <div {...rise(1, "kpis")}>
        <KpiCard icon="truck" value={data.deliveries.length} label="Deliveries on file" />
        <KpiCard icon="box" value={sum((r) => r.units)} label="Units counted" />
        <KpiCard icon="damage" value={sum((r) => r.damaged)} label="Units damaged" />
        <KpiCard icon="dollar" value={sum((r) => r.value)} format="money" label="Value received" />
      </div>
      <section {...rise(2, "card")}>
        <div className="toolbar">
          <div className="seg-wrap">
            <Seg label="Which deliveries" value={tab} onChange={(t) => { setTab(t); setShown(15); }} options={[
              { value: "all", label: "All", count: tabs.all.length },
              { value: "week", label: "Last 7 days", count: tabs.week.length },
              { value: "issues", label: "With issues", count: tabs.issues.length },
            ]} />
          </div>
          <div className="toolbar-right">
            <label className="field" htmlFor="dq"><Icon name="search" />
              <input id="dq" value={query} onChange={(e) => { setQuery(e.target.value); setShown(15); }} placeholder="PO, supplier, slip or person" />
            </label>
            <SqlButton k="deliveries" /><SqlButton k="deliveryLines" />
          </div>
        </div>
        <div className="dlist"><div className="dlist-inner">
          <div className="dhead"><span>Date</span><span>Order</span><span>Supplier</span><span>Slip</span><span>Counted by</span><span className="r">Lines</span><span className="r">Units</span><span>Entered</span><span /></div>
          {rows.length === 0 && <p className="empty">No deliveries match.</p>}
          {rows.slice(0, shown).map((r, i) => {
            const isOpen = open.has(r.receiptId);
            return (
              <div key={r.receiptId} className={`drow rise${isOpen ? " open" : ""}`} style={{ ["--i" as string]: Math.min(i, 14) } as CSSProperties}>
                <button type="button" className="drow-main" aria-expanded={isOpen} onClick={() => toggle(r.receiptId)}>
                  <span>{fmtDay(r.receivedOn)}</span>
                  <b>{r.poNumber}</b>
                  <SupTag id={r.supplierId} name={r.supplier} />
                  <span className="muted">{r.packingSlipNo}</span>
                  <span className="sup"><span className="initials sm" style={{ background: personColor(r.receivedBy) }}>{initials(r.receivedBy)}</span><span>{r.receivedBy}</span></span>
                  <span className="r tnum">{r.lines}</span>
                  <span className="r tnum"><b>{fmtInt(r.units)}</b></span>
                  <span><span className={`pill-s ${r.source === "manual" ? "st-manual" : "st-reader"}`}>{r.source === "manual" ? "By hand" : "Doc reader"}</span></span>
                  <Icon name="chev" className="chev" />
                </button>
                <div className="drow-body"><div>
                  <table>
                    <thead><tr><th>Product</th><th className="r">Ordered</th><th className="r">On this delivery</th><th className="r">Damaged</th><th>Line status</th></tr></thead>
                    <tbody>
                      {(linesByReceipt.get(r.receiptId) ?? []).map((l) => (
                        <Fragment key={l.sku}>
                          <tr>
                            <td>{l.product}<span className="sku">{l.sku}</span></td>
                            <td className="r tnum">{l.qtyOrdered}</td>
                            <td className="r tnum">{l.qtyReceived}</td>
                            <td className="r tnum">{l.qtyDamaged ? <b className="warn-text">{l.qtyDamaged}</b> : 0}</td>
                            <td><StatusPill status={l.status} /></td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              </div>
            );
          })}
        </div></div>
        {rows.length > shown && (
          <div className="more"><button type="button" className="btn sm" onClick={() => setShown((s) => s + 15)}>Show {Math.min(15, rows.length - shown)} more of {rows.length - shown}</button></div>
        )}
      </section>
    </>
  );
}

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
