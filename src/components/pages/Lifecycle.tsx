"use client";

import { useState, type CSSProperties } from "react";
import type { ItamData, WarrantyRow } from "@/lib/itam-data";
import { fmtDay, fmtK, fmtMoney } from "@/lib/format";
import { ageText, CATEGORY_LABEL, warrantyText } from "@/lib/itam-helpers";
import { niceScale } from "@/lib/view-helpers";
import { AssetPill, CATEGORY_ICON } from "../it-ui";
import { Icon } from "../icons";
import { Count, KpiCard, Seg, SqlButton, useUi, rise } from "../ui";

type Tab = "ending" | "replace" | "next12";

export function Lifecycle({ it }: { it: ItamData }) {
  const ui = useUi();
  const [tab, setTab] = useState<Tab>("ending");
  const w = it.warranty;
  const tabs: Record<Tab, WarrantyRow[]> = {
    ending: w.filter((a) => a.warrantyDaysLeft >= 0 && a.warrantyDaysLeft <= 90),
    replace: w.filter((a) => a.refreshDaysLeft <= 0),
    next12: w.filter((a) => a.refreshDaysLeft > 0 && a.refreshDaysLeft <= 365).sort((a, b) => a.refreshDaysLeft - b.refreshDaysLeft),
  };
  const plan = it.refreshPlan;
  const { top } = niceScale(Math.max(1, ...plan.map((p) => p.replacementCost)));
  const planTotal = plan.reduce((a, p) => a + p.replacementCost, 0);

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Warranty &amp; refresh</h1><p>Which devices lose their warranty soon, which are past their useful life, and what replacing them will cost.</p></div>
      </div>
      <div {...rise(1, "kpis")}>
        <KpiCard icon="clock" value={tabs.ending.length} label="Warranties ending" hint="in the next 90 days: book free repairs now" />
        <KpiCard icon="refresh" value={tabs.replace.length} label="Past useful life" hint="older than the model's planned life" />
        <KpiCard icon="laptop" value={tabs.next12.length} label="Due in the next 12 months" hint="reach the end of their useful life" />
        <KpiCard icon="dollar" value={planTotal} format="money" label="Refresh budget" hint="overdue + next 4 quarters, at purchase price" />
      </div>

      <section {...rise(2, "card")}>
        <div className="card-head">
          <div><h2>Refresh plan by quarter</h2><p className="sub">Cost to replace devices as they reach the end of their life. Use it for the budget.</p></div>
          <SqlButton k="refreshPlan" />
        </div>
        <div className="qbars">
          {plan.map((p, i) => (
            <div key={p.bucket} className={`qbar${p.bucket === "Overdue" ? " overdue" : ""}`}>
              <b className="tnum">{p.replacementCost ? fmtK(p.replacementCost) : "$0"}</b>
              <div className="qbar-track"><i style={{ transform: `scaleY(${p.replacementCost / top})`, ["--j" as string]: i } as CSSProperties} /></div>
              <span>{p.bucket}</span>
              <small className="muted">{p.assets} {p.assets === 1 ? "device" : "devices"}</small>
            </div>
          ))}
        </div>
      </section>

      <section {...rise(3, "card")}>
        <div className="toolbar">
          <div className="seg-wrap">
            <Seg label="Show" value={tab} onChange={setTab} options={[
              { value: "ending", label: "Warranty ending", count: tabs.ending.length },
              { value: "replace", label: "Replace now", count: tabs.replace.length },
              { value: "next12", label: "Replace in 12 months", count: tabs.next12.length },
            ]} />
          </div>
          <div className="toolbar-right"><SqlButton k="warranty" /></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Asset</th><th>Assigned to</th><th>Bought</th><th>Age</th><th>Warranty</th><th>Replace by</th><th className="r">Cost</th><th>Status</th></tr></thead>
            <tbody key={tab}>
              {tabs[tab].length === 0 && <tr><td colSpan={8} className="empty">Nothing here.</td></tr>}
              {tabs[tab].map((a, i) => (
                <tr key={a.assetId} className="rise click" style={{ ["--i" as string]: Math.min(i, 20) } as CSSProperties}
                  tabIndex={0} onClick={() => ui.openAsset(a.assetId)} onKeyDown={(e) => { if (e.key === "Enter") ui.openAsset(a.assetId); }}>
                  <td><span className="asset-tag"><Icon name={CATEGORY_ICON[a.category]} /><b>{a.assetTag}</b></span>
                    <span className="sku">{a.manufacturer} {a.modelName} · {CATEGORY_LABEL[a.category].replace(/s$/, "")}</span></td>
                  <td>{a.assignedTo ?? <span className="muted">{a.status === "deployed" ? "Shared" : "-"}</span>}<span className="sku">{a.location}</span></td>
                  <td>{fmtDay(a.purchasedOn)} <span className="muted">&apos;{a.purchasedOn.slice(2, 4)}</span></td>
                  <td>{ageText(a.ageMonths)}<span className="sku">life {a.usefulLifeMonths / 12} yr</span></td>
                  <td><span className={a.warrantyDaysLeft >= 0 && a.warrantyDaysLeft <= 90 ? "warn-text" : a.warrantyDaysLeft < 0 ? "muted" : ""}>{warrantyText(a.warrantyDaysLeft)}</span></td>
                  <td>{fmtDay(a.refreshDueOn)} <span className="muted">&apos;{a.refreshDueOn.slice(2, 4)}</span>
                    {a.refreshDaysLeft <= 0 && <span className="late block">{Math.round(-a.refreshDaysLeft / 30.44)} months late</span>}</td>
                  <td className="r tnum">{fmtMoney(a.purchaseCost)}</td>
                  <td><AssetPill status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          Totals: <b className="ink"><Count value={tabs[tab].reduce((s, a) => s + a.purchaseCost, 0)} format="money" /></b> at purchase price.
          Warranty and useful life come from each model, so every device of the same model follows the same rule.
        </p>
      </section>
    </>
  );
}
