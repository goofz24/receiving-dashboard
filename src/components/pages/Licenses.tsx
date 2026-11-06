"use client";

import type { CSSProperties } from "react";
import type { ItamData } from "@/lib/itam-data";
import { fmtDay, fmtMoney } from "@/lib/format";
import { offboardingTicket } from "@/lib/itam-helpers";
import { Icon } from "../icons";
import { Count, KpiCard, SqlButton, useUi, rise } from "../ui";

export function Licenses({ it }: { it: ItamData }) {
  const ui = useUi();
  const ls = it.licenses;
  const spend = ls.reduce((a, l) => a + l.costPerYear, 0);
  const waste = ls.reduce((a, l) => a + l.wastePerYear, 0);
  const leaverSeats = ls.reduce((a, l) => a + l.seatsWithLeavers, 0);
  const over = ls.filter((l) => l.seatsFree < 0);
  const holders = it.offboarding.filter((p) => p.seats > 0);

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Licenses</h1><p>Software seats the company pays for every year: who uses them, which are wasted, and what renews next.</p></div>
      </div>
      <div {...rise(1, "kpis")}>
        <KpiCard icon="dollar" value={spend} format="money" label="Spend per year" hint={`${ls.length} subscriptions`} />
        <KpiCard icon="key" value={waste} format="money" label="Wasted per year" hint="seats nobody uses + seats leavers hold"
          extra={waste > 0 && <span className="pill-s st-over">{spend ? Math.round((100 * waste) / spend) : 0}%</span>} />
        <KpiCard icon="userx" value={leaverSeats} label="Seats held by leavers" hint="should be removed at offboarding" />
        <KpiCard icon="alert" value={over.length} label="Over the seat limit" hint={over.map((l) => l.product).join(", ") || "none: all within what was bought"}
          extra={over.length > 0 && <span className="pill-s st-overdue">Compliance</span>} />
      </div>

      <div {...rise(2, "lgrid")}>
        {ls.map((l, i) => {
          const usedPct = Math.min(1, l.seatsUsed / Math.max(1, l.seatsOwned));
          const leaverPct = Math.min(usedPct, l.seatsWithLeavers / Math.max(1, l.seatsOwned));
          return (
            <section key={l.licenseId} className="card lift lcard rise" style={{ ["--i" as string]: i + 2 } as CSSProperties}>
              <div className="qtop">
                <div style={{ minWidth: 0 }}><h2>{l.product}</h2><p className="sub">{l.vendor} · {fmtMoney(l.costPerSeatYear)} per seat a year</p></div>
                {l.seatsFree < 0 ? <span className="pill-s st-overdue">{-l.seatsFree} over</span>
                  : l.seatsFree > 0 ? <span className="pill-s st-awaiting">{l.seatsFree} free</span> : <span className="pill-s st-complete">Full</span>}
              </div>
              <div className="big tnum"><Count value={l.seatsUsed} /> <small>of {l.seatsOwned} seats used</small></div>
              <div className={`seatbar${l.seatsFree < 0 ? " over" : ""}`} title={`${l.seatsUsed} used, ${l.seatsWithLeavers} by people who left`}>
                <i className="used" style={{ transform: `scaleX(${usedPct})`, animationDelay: `${i * 70}ms` }} />
                <i className="leavers" style={{ transform: `scaleX(${leaverPct})`, animationDelay: `${i * 70 + 150}ms` }} />
              </div>
              <div className="stats">
                <div className="stat"><b>{fmtMoney(l.costPerYear)}</b><small>per year</small></div>
                <div className="stat"><b className={l.wastePerYear ? "warn-text" : ""}>{fmtMoney(l.wastePerYear)}</b><small>wasted</small></div>
                <div className="stat"><b className={l.renewsInDays <= 30 ? "warn-text" : ""}>{l.renewsInDays}d</b><small>renews {fmtDay(l.renewsOn)}</small></div>
              </div>
              <div className="chips">
                {l.seatsWithLeavers > 0 && <span className="pill-s st-over">{l.seatsWithLeavers} held by {l.seatsWithLeavers === 1 ? "a leaver" : "leavers"}</span>}
                {l.renewsInDays <= 30 && <span className="pill-s st-overdue">Renews soon: right-size before then</span>}
              </div>
            </section>
          );
        })}
      </div>

      <section {...rise(3, "card")}>
        <div className="card-head">
          <div><h2>Seats to take back</h2><p className="sub">People who left and still hold a paid seat.</p></div>
          <div className="actions"><SqlButton k="licenses" /><SqlButton k="offboarding" /></div>
        </div>
        <div className="list">
          {holders.length === 0 && <p className="empty">No leaver holds a seat.</p>}
          {holders.map((p) => (
            <div className="li" key={p.employeeId}>
              <span className="chip-ico"><Icon name="userx" /></span>
              <div style={{ minWidth: 0 }}><div className="t">{p.fullName} <span className="muted">· left {fmtDay(p.leftOn)}</span></div><div className="s">{p.seatList}</div></div>
              <div className="off-right">
                <b className="tnum">{fmtMoney(p.seatCostPerYear)}<span className="muted"> /yr</span></b>
                <button type="button" className="btn sm" onClick={() => ui.copy(offboardingTicket(p, fmtDay), `Ticket for ${p.fullName} copied`)}><Icon name="ticket" />Copy ticket</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
