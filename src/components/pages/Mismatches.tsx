"use client";

import { useState, type CSSProperties } from "react";
import type { DashboardData, MismatchRow } from "@/lib/data";
import { fmtDay, fmtMoney2 } from "@/lib/format";
import { followUpEmail, type FollowUpKind } from "@/lib/view-helpers";
import { Prog } from "../charts";
import { Icon } from "../icons";
import { Seg, SqlButton, StatusPill, SupTag, useUi, rise } from "../ui";

type Tab = "all" | "short" | "over" | "damaged";

const kindOf = (m: MismatchRow): FollowUpKind => (m.status === "short" ? "short" : m.status === "over" ? "over" : "damaged");

export function Mismatches({ data, openOrders }: { data: DashboardData; openOrders: (po: string) => void }) {
  const ui = useUi();
  const [tab, setTab] = useState<Tab>("all");
  const all = data.mismatches;
  const tabs: Record<Tab, MismatchRow[]> = {
    all, short: all.filter((m) => m.status === "short"), over: all.filter((m) => m.status === "over"), damaged: all.filter((m) => m.qtyDamaged > 0),
  };
  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Mismatches</h1><p>Order lines where the count didn&apos;t match the order, or units arrived damaged. Copy a follow-up for the supplier in one click.</p></div>
        <div className="actions"><SqlButton k="mismatches" /></div>
      </div>
      <div {...rise(1, "seg-wrap")}>
        <Seg label="Kind of mismatch" value={tab} onChange={setTab} options={[
          { value: "all", label: "All", count: tabs.all.length }, { value: "short", label: "Short", count: tabs.short.length },
          { value: "over", label: "Over", count: tabs.over.length }, { value: "damaged", label: "Damaged", count: tabs.damaged.length },
        ]} />
      </div>
      <div className="qgrid" key={tab}>
        {tabs[tab].length === 0 && <p className="empty">Nothing here.</p>}
        {tabs[tab].map((m, i) => {
          const kind = tab === "damaged" ? "damaged" : kindOf(m);
          const diff = m.qtyReceived - m.qtyOrdered;
          const stake = kind === "damaged" ? m.qtyDamaged * m.unitCost : Math.abs(diff) * m.unitCost;
          const scale = Math.max(m.qtyOrdered, m.qtyReceived);
          return (
            <section key={m.poLineId} className="card lift qcard rise" style={{ ["--i" as string]: Math.min(i, 16) + 2 } as CSSProperties}>
              <div className="qtop"><StatusPill status={kind} /><span className="muted small">{fmtDay(m.lastReceivedOn)}</span></div>
              <div className="big tnum">
                {kind === "damaged" ? <>{m.qtyDamaged} <small>damaged</small></> : <>{diff > 0 ? "+" : ""}{diff} <small>units</small></>}
              </div>
              <div className="meta"><b className="ink">{m.product}</b><span>{m.sku} · {m.poNumber}</span><SupTag id={m.supplierId} name={m.supplier} /></div>
              <div className="cmp">
                <div className="cmp-row"><span>Ordered</span><Prog fraction={m.qtyOrdered / scale} color="var(--ink-3)" delay={i * 30} /><b className="r tnum ink">{m.qtyOrdered}</b></div>
                <div className="cmp-row"><span>Received</span><Prog fraction={m.qtyReceived / scale} tone={m.status} delay={i * 30 + 80} /><b className="r tnum ink">{m.qtyReceived}</b></div>
              </div>
              <div className="muted small">{kind === "over" ? "Extra value: " : "Value at stake: "}<b className="ink">{fmtMoney2(stake)}</b></div>
              <div className="row">
                <button type="button" className="btn sm solid" onClick={() => ui.copy(followUpEmail({ ...m, receivedOn: m.lastReceivedOn }, kind, fmtDay), `Follow-up for ${m.supplier} copied`)}>
                  <Icon name="mail" />Copy follow-up
                </button>
                <button type="button" className="btn sm" onClick={() => openOrders(m.poNumber)}><Icon name="arrow" />View order</button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
