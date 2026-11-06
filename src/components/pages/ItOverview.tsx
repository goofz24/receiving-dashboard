"use client";

import type { ItamData } from "@/lib/itam-data";
import { fmtDay, fmtMoney } from "@/lib/format";
import { offboardingTicket } from "@/lib/itam-helpers";
import { initials } from "@/lib/view-helpers";
import { StatusBars } from "../it-ui";
import { Icon } from "../icons";
import { KpiCard, SqlButton, useUi, rise } from "../ui";
import { personColor } from "./Overview";

export type AssetTab = "all" | "deployed" | "in_stock" | "in_repair" | "ordered" | "gone" | "fix";

export function ItOverview({ it, go, openAssets }: { it: ItamData; go: (page: string) => void; openAssets: (q: string, tab?: AssetTab) => void }) {
  const ui = useUi();
  const k = it.itKpis;
  const wasted = it.licenses.reduce((a, l) => a + l.wastePerYear, 0);
  const overLicensed = it.licenses.filter((l) => l.seatsFree < 0);
  const openTag = (tag: string) => { const a = it.assets.find((x) => x.assetTag === tag); if (a) ui.openAsset(a.assetId); };
  const healthIssues = it.deviceHealth.filter((h) => h.flagBitlocker || h.flagLowDisk || h.flagUpdates || h.flagNotChecked).length;

  // the to-do list: one line per kind of problem, biggest risk first
  const todo = [
    { n: k.withLeavers, icon: "userx" as const, t: "Devices still with people who left", s: "Recover them, then wipe and re-issue",
      go: () => document.getElementById("offboarding")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
    { n: k.bitlockerOff, icon: "shield" as const, t: "Laptops with BitLocker off", s: "A lost laptop without disk encryption is a data leak", go: () => go("health") },
    { n: overLicensed.length, icon: "key" as const, t: "Licenses with more users than seats", s: overLicensed.map((l) => l.product).join(", ") || "None", go: () => go("licenses") },
    { n: k.personalNoOwner, icon: "alert" as const, t: "Laptops or phones with no owner recorded", s: "Find who has them and fix the record", go: () => openAssets("", "fix") },
    { n: k.notChecked30d, icon: "pulse" as const, t: "Computers not checked in 30+ days", s: "Off the network, broken agent, or lost", go: () => go("health") },
    { n: k.warrantyEnding90d, icon: "clock" as const, t: "Warranties ending in 90 days", s: "Last chance for free repairs", go: () => go("lifecycle") },
  ].filter((x) => x.n > 0);

  return (
    <>
      <div {...rise(0, "head")}>
        <div>
          <h1>IT assets</h1>
          <p>Every laptop, phone, screen and software seat, from purchase to disposal. <b>{todo.length} kinds of problems</b> need a look.</p>
        </div>
        <div className="actions">
          <a className="btn" href="#assets"><Icon name="laptop" />All assets</a>
          <a className="btn solid" href="#ask"><Icon name="sparkles" />Ask AI</a>
        </div>
      </div>

      <div {...rise(1, "kpis")}>
        <KpiCard icon="laptop" value={k.activeAssets} label="Devices in the company" hint={`${k.deployed} handed out · ${k.inStock} in stock · ${k.onOrder} on order`} />
        <KpiCard icon="dollar" value={k.valueInUse} format="money" label="Value of devices in use" hint="purchase price, not counting retired" />
        <KpiCard icon="userx" value={k.withLeavers} label="Devices with leavers" hint="assigned to people who have left"
          extra={k.withLeavers > 0 && <span className="pill-s st-overdue">Recover</span>} />
        <KpiCard icon="key" value={wasted} format="money" label="License waste per year" hint="unused seats + seats leavers still hold"
          extra={wasted > 0 && <span className="pill-s st-over">Save</span>} />
        <KpiCard icon="shield" value={k.bitlockerOff} label="BitLocker off" hint="from the latest health check"
          extra={k.bitlockerOff > 0 && <span className="pill-s st-overdue">Risk</span>} />
        <KpiCard icon="pulse" value={healthIssues} label="Computers with health issues" hint="encryption, disk, updates or no check-in" />
        <KpiCard icon="clock" value={k.warrantyEnding90d} label="Warranties ending" hint="in the next 90 days" />
        <KpiCard icon="refresh" value={k.pastUsefulLife} label="Past useful life" hint="due for replacement now" />
      </div>
      <div {...rise(2, "kpi-sql")}><button type="button" className="link-btn" onClick={() => ui.showSql("itKpis")}><Icon name="code" />Show the SQL for these numbers</button></div>

      <div {...rise(3, "two")}>
        <section className="card">
          <div className="card-head">
            <div><h2>Needs attention</h2><p className="sub">Biggest risk first. Click one to see the devices.</p></div>
          </div>
          <div className="list">
            {todo.length === 0 && <p className="empty">Nothing needs attention.</p>}
            {todo.map((x) => (
              <button type="button" className="li" key={x.t} onClick={x.go}>
                <span className="chip-ico"><Icon name={x.icon} /></span>
                <div style={{ minWidth: 0 }}><div className="t">{x.t}</div><div className="s">{x.s}</div></div>
                <b className="tnum big-n">{x.n}</b>
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div><h2>Devices by type</h2><p className="sub">Where every device is in its life. Click a type to list them.</p></div>
            <SqlButton k="statusByCategory" />
          </div>
          <StatusBars rows={it.statusByCategory} onPick={(c) => openAssets(c)} />
        </section>
      </div>

      <section {...rise(4, "card")} id="offboarding">
        <div className="card-head">
          <div><h2>Offboarding gaps</h2><p className="sub">People who left but still have a company device or a paid seat. Copy a ready help desk ticket.</p></div>
          <SqlButton k="offboarding" />
        </div>
        <div className="list">
          {it.offboarding.length === 0 && <p className="empty">Everyone who left handed everything back.</p>}
          {it.offboarding.map((p) => (
            <div className="li off-li" key={p.employeeId}>
              <span className="initials" style={{ background: personColor(p.fullName) }}>{initials(p.fullName)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{p.fullName} <span className="muted">· {p.title}, {p.department}</span></div>
                <div className="s">Left {fmtDay(p.leftOn)} ({p.daysSinceLeft} days ago)</div>
                <div className="chips" style={{ marginTop: 6 }}>
                  {(p.deviceList ?? "").split("; ").filter(Boolean).map((dv) => (
                    <button type="button" key={dv} className="pill-s st-overdue chip-btn" onClick={() => openTag(dv.split(" ")[0])}>{dv}</button>
                  ))}
                  {(p.seatList ?? "").split("; ").filter(Boolean).map((s) => <span key={s} className="pill-s st-over">{s} seat</span>)}
                </div>
              </div>
              <div className="off-right">
                <span className="small tnum">
                  {p.deviceValue > 0 && <b>{fmtMoney(p.deviceValue)} <span className="muted">in devices</span></b>}
                  {p.deviceValue > 0 && p.seatCostPerYear > 0 && <br />}
                  {p.seatCostPerYear > 0 && <b>{fmtMoney(p.seatCostPerYear)}<span className="muted">/yr in seats</span></b>}
                </span>
                <button type="button" className="btn sm" onClick={() => ui.copy(offboardingTicket(p, fmtDay), `Ticket for ${p.fullName} copied`)}><Icon name="ticket" />Copy ticket</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section {...rise(5, "card")}>
        <div className="card-head">
          <div><h2>New hires</h2><p className="sub">Started in the last 30 days. Does everyone have a laptop?</p></div>
          <SqlButton k="newHires" />
        </div>
        <div className="list">
          {it.newHires.length === 0 && <p className="empty">No one started in the last 30 days.</p>}
          {it.newHires.map((h) => (
            <div className="li" key={h.employeeId}>
              <span className="initials" style={{ background: personColor(h.fullName) }}>{initials(h.fullName)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{h.fullName} <span className="muted">· {h.title}, {h.department}</span></div>
                <div className="s">Started {fmtDay(h.startedOn)} · {h.devices ? `has ${h.deviceList}` : "no devices yet"}</div>
              </div>
              {h.laptops > 0 ? <span className="pill-s st-complete">Has a laptop</span>
                : <button type="button" className="pill-s st-overdue chip-btn" onClick={() => openAssets("laptop", "ordered")}>No laptop yet</button>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
