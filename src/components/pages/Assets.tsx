"use client";

import { useState, type CSSProperties } from "react";
import type { AssetRow, ItamData } from "@/lib/itam-data";
import { fmtDay, fmtMoney } from "@/lib/format";
import { ageText, CATEGORY_LABEL } from "@/lib/itam-helpers";
import { toCsv } from "@/lib/view-helpers";
import { AssetPill, CATEGORY_ICON } from "../it-ui";
import { Icon } from "../icons";
import { KpiCard, Seg, SqlButton, useUi, rise } from "../ui";
import type { AssetTab } from "./ItOverview";

const GONE = new Set(["lost", "retired", "disposed"]);
// "Needs fixing": out with someone who left, or a personal device with nobody recorded.
const needsFix = (a: AssetRow) => a.status === "deployed" && (a.ownerLeftOn !== null || (a.assignedTo === null && ["laptop", "phone", "tablet"].includes(a.category)));

const TABS: { value: AssetTab; label: string; test: (a: AssetRow) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "deployed", label: "Handed out", test: (a) => a.status === "deployed" },
  { value: "in_stock", label: "In stock", test: (a) => a.status === "in_stock" },
  { value: "in_repair", label: "In repair", test: (a) => a.status === "in_repair" },
  { value: "ordered", label: "On order", test: (a) => a.status === "ordered" },
  { value: "gone", label: "Lost or retired", test: (a) => GONE.has(a.status) },
  { value: "fix", label: "Needs fixing", test: needsFix },
];

export function Assets({ it, query, setQuery, tab, setTab }: {
  it: ItamData; query: string; setQuery: (q: string) => void; tab: AssetTab; setTab: (t: AssetTab) => void;
}) {
  const ui = useUi();
  const [shown, setShown] = useState(30);
  const k = it.itKpis;
  const q = query.trim().toLowerCase();
  const test = TABS.find((t) => t.value === tab)!.test;
  const rows = it.assets.filter((a) => test(a) && (!q || [a.assetTag, a.serialNumber, a.category, CATEGORY_LABEL[a.category], a.manufacturer, a.modelName,
    a.assignedTo ?? "", a.department ?? "", a.location].join(" ").toLowerCase().includes(q)));

  const copyCsv = () => ui.copy(
    toCsv(["asset_tag", "serial_number", "category", "manufacturer", "model", "status", "assigned_to", "location", "purchased_on", "purchase_cost", "warranty_ends_on"],
      rows.map((a) => [a.assetTag, a.serialNumber, a.category, a.manufacturer, a.modelName, a.status, a.assignedTo ?? "", a.location, a.purchasedOn, a.purchaseCost.toFixed(2), a.warrantyEndsOn])),
    `${rows.length} assets copied as CSV`);

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Assets</h1><p>Every device with its status, owner and warranty, from the <b>asset_current</b> view. Click one to see its whole history.</p></div>
        <div className="actions"><button type="button" className="btn" onClick={copyCsv}><Icon name="copy" />Copy as CSV</button></div>
      </div>
      <div {...rise(1, "kpis")}>
        <KpiCard icon="laptop" value={k.deployed} label="Handed out" hint="to a person or a shared spot" />
        <KpiCard icon="box" value={k.inStock} label="In stock" hint="ready to hand out" />
        <KpiCard icon="wrench" value={k.inRepair} label="In repair" hint="out with the repair shop" />
        <KpiCard icon="truck" value={k.onOrder} label="On order" hint="bought, not delivered yet" />
      </div>
      <section {...rise(2, "card")}>
        <div className="toolbar">
          <div className="seg-wrap">
            <Seg label="Asset status" value={tab} onChange={(t) => { setTab(t); setShown(30); }}
              options={TABS.map((t) => ({ value: t.value, label: t.label, count: it.assets.filter(t.test).length }))} />
          </div>
          <div className="toolbar-right">
            <label className="field" htmlFor="aq"><Icon name="search" />
              <input id="aq" value={query} onChange={(e) => { setQuery(e.target.value); setShown(30); }} placeholder="Tag, serial, model, person or place" />
            </label>
            <SqlButton k="assets" />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Asset</th><th>Model</th><th>Assigned to</th><th>Location</th><th>Age</th><th>Warranty</th><th className="r">Cost</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="empty">No assets match.</td></tr>}
              {rows.slice(0, shown).map((a, i) => (
                <tr key={a.assetId} className="rise click" style={{ ["--i" as string]: Math.min(i, 20) } as CSSProperties}
                  tabIndex={0} onClick={() => ui.openAsset(a.assetId)} onKeyDown={(e) => { if (e.key === "Enter") ui.openAsset(a.assetId); }}>
                  <td><span className="asset-tag"><Icon name={CATEGORY_ICON[a.category]} /><b>{a.assetTag}</b></span><span className="sku mono">{a.serialNumber}</span></td>
                  <td>{a.manufacturer} {a.modelName}<span className="sku">{CATEGORY_LABEL[a.category].replace(/s$/, "")}</span></td>
                  <td>{a.assignedTo ?? (a.status === "deployed" ? <span className={needsFix(a) ? "warn-text" : "muted"}>{needsFix(a) ? "Not recorded" : "Shared"}</span> : <span className="muted">-</span>)}
                    {a.ownerLeftOn && <span className="late block">Left {fmtDay(a.ownerLeftOn)}</span>}
                    {a.department && !a.ownerLeftOn && <span className="sku">{a.department}</span>}</td>
                  <td>{a.location}</td>
                  <td>{ageText(a.ageMonths)}</td>
                  <td>{fmtDay(a.warrantyEndsOn)} {a.warrantyEndsOn.slice(2, 4) !== "" && <span className="muted">&apos;{a.warrantyEndsOn.slice(2, 4)}</span>}
                    {!GONE.has(a.status) && a.warrantyDaysLeft >= 0 && a.warrantyDaysLeft <= 90 && <span className="warn-text small block">ends in {a.warrantyDaysLeft} days</span>}</td>
                  <td className="r tnum">{fmtMoney(a.purchaseCost)}</td>
                  <td><AssetPill status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown && <div className="more"><button type="button" className="btn sm" onClick={() => setShown((s) => s + 30)}>Show more ({rows.length - shown} left)</button></div>}
      </section>
    </>
  );
}
