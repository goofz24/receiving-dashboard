"use client";

import { useState, type CSSProperties } from "react";
import type { DashboardData } from "@/lib/data";
import { supplierColor, weeklyTotals } from "@/lib/view-helpers";
import { Ring, Sparkline } from "../charts";
import { Icon } from "../icons";
import { Count, Seg, SqlButton, rise } from "../ui";

type Sort = "valueReceived" | "fillRatePct" | "onTimePct" | "supplier";

export function Suppliers({ data, openOrders }: { data: DashboardData; openOrders: (supplier: string) => void }) {
  const [sort, setSort] = useState<Sort>("valueReceived");
  const health = new Map(data.supplierHealth.map((h) => [h.supplierId, h]));
  const cards = data.suppliers.map((s) => ({
    ...s, ...(health.get(s.supplierId) ?? { shortLines: 0, overdueLines: 0, onTimePct: 0 }),
    weeks: weeklyTotals(data.weeks, 12, s.supplierId).map((w) => w.units),
  })).sort((a, b) => (sort === "supplier" ? a.supplier.localeCompare(b.supplier) : b[sort] - a[sort]));

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Suppliers</h1><p>How each supplier is doing on orders that were already due. Click one to see its order lines.</p></div>
        <div className="actions">
          <Seg label="Sort by" value={sort} onChange={setSort} options={[
            { value: "valueReceived", label: "Value" }, { value: "fillRatePct", label: "Fill rate" },
            { value: "onTimePct", label: "On time" }, { value: "supplier", label: "Name" },
          ]} />
          <SqlButton k="suppliers" /><SqlButton k="supplierHealth" />
        </div>
      </div>
      <div className="sgrid">
        {cards.map((s, i) => (
          <button key={s.supplierId} type="button" className="card lift scard rise" style={{ ["--i" as string]: i + 1 } as CSSProperties} onClick={() => openOrders(s.supplier)}>
            <div className="scard-top">
              <Ring pct={s.fillRatePct} color={supplierColor(s.supplierId)} delay={i * 80} />
              <div style={{ minWidth: 0 }}>
                <h2>{s.supplier}</h2>
                <div className="chips" style={{ marginTop: 6 }}>
                  <span className="tag"><Icon name="pin" />{s.city}</span>
                  <span className="tag"><Icon name="clock" />{s.leadTimeDays} day lead time</span>
                </div>
              </div>
            </div>
            <div className="stats">
              <div className="stat"><b><Count value={s.valueReceived} format="k" /></b><small>value received</small></div>
              <div className="stat"><b><Count value={s.onTimePct} format="pct" /></b><small>lines on time</small></div>
              <div className="stat"><b><Count value={s.orders} /></b><small>orders due</small></div>
            </div>
            <Sparkline values={s.weeks} color={supplierColor(s.supplierId)} id={String(s.supplierId)} />
            <div className="chips">
              {s.shortLines ? <span className="pill-s st-short">{s.shortLines} short {s.shortLines === 1 ? "line" : "lines"}</span> : <span className="pill-s st-complete">No short lines</span>}
              {s.overdueLines > 0 && <span className="pill-s st-overdue">{s.overdueLines} overdue</span>}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
