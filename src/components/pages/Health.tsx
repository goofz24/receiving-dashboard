"use client";

import { useState, type CSSProperties } from "react";
import type { DeviceHealthRow, ItamData } from "@/lib/itam-data";
import { fmtDay } from "@/lib/format";
import { Prog } from "../charts";
import { CATEGORY_ICON } from "../it-ui";
import { Icon } from "../icons";
import { KpiCard, Seg, SqlButton, useUi, rise } from "../ui";

type Tab = "issues" | "bitlocker" | "disk" | "updates" | "stale" | "all";
const anyIssue = (h: DeviceHealthRow) => h.flagBitlocker || h.flagLowDisk || h.flagUpdates || h.flagNotChecked;

export function Health({ it }: { it: ItamData }) {
  const ui = useUi();
  const [tab, setTab] = useState<Tab>("issues");
  const all = it.deviceHealth;
  const tabs: Record<Tab, DeviceHealthRow[]> = {
    issues: all.filter(anyIssue), bitlocker: all.filter((h) => h.flagBitlocker), disk: all.filter((h) => h.flagLowDisk),
    updates: all.filter((h) => h.flagUpdates), stale: all.filter((h) => h.flagNotChecked), all,
  };
  const encrypted = all.filter((h) => h.bitlockerOn).length;
  const checkedIn = all.filter((h) => !h.flagNotChecked).length;

  const copyList = () => ui.copy(
    "Device health follow-ups\n\n" + tabs.issues.map((h) => `- ${h.assetTag} (${h.manufacturer} ${h.modelName}, ${h.assignedTo ?? "shared"}): ${[
      h.flagBitlocker && "turn BitLocker on", h.flagLowDisk && `free up disk space (${h.diskFreePct}% free)`,
      h.flagUpdates && `install ${h.pendingUpdates} pending updates`, h.flagNotChecked && (h.checkedOn ? `no check-in since ${fmtDay(h.checkedOn)}` : "never checked in"),
    ].filter(Boolean).join("; ")}`).join("\n"),
    "Follow-up list copied");

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Device health</h1><p>The newest health check from each laptop and desktop that is handed out, from the <b>device_health</b> view.</p></div>
        <div className="actions"><button type="button" className="btn solid" onClick={copyList} disabled={!tabs.issues.length}><Icon name="ticket" />Copy follow-up list</button></div>
      </div>
      <div {...rise(1, "kpis")}>
        <KpiCard icon="shield" value={all.length ? (100 * encrypted) / all.length : 0} format="pct" label="Encrypted with BitLocker" hint={`${encrypted} of ${all.length} computers`}
          extra={tabs.bitlocker.length > 0 && <span className="pill-s st-overdue">{tabs.bitlocker.length} off</span>} />
        <KpiCard icon="pulse" value={checkedIn} label="Checked in this month" hint={`${tabs.stale.length} silent for 30+ days or never`} />
        <KpiCard icon="box" value={tabs.disk.length} label="Low on disk space" hint="less than 15% free" />
        <KpiCard icon="refresh" value={tabs.updates.length} label="Behind on updates" hint="more than 5 waiting" />
      </div>
      <section {...rise(2, "card")}>
        <div className="toolbar">
          <div className="seg-wrap">
            <Seg label="Problem" value={tab} onChange={setTab} options={[
              { value: "issues", label: "Any problem", count: tabs.issues.length }, { value: "bitlocker", label: "BitLocker off", count: tabs.bitlocker.length },
              { value: "disk", label: "Low disk", count: tabs.disk.length }, { value: "updates", label: "Updates", count: tabs.updates.length },
              { value: "stale", label: "No check-in", count: tabs.stale.length }, { value: "all", label: "All", count: all.length },
            ]} />
          </div>
          <div className="toolbar-right"><SqlButton k="deviceHealth" /></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Computer</th><th>User</th><th>Last check</th><th>System</th><th>BitLocker</th><th>Disk free</th><th className="r">Updates</th></tr></thead>
            <tbody key={tab}>
              {tabs[tab].length === 0 && <tr><td colSpan={7} className="empty">Nothing here.</td></tr>}
              {tabs[tab].map((h, i) => (
                <tr key={h.assetId} className="rise click" style={{ ["--i" as string]: Math.min(i, 20) } as CSSProperties}
                  tabIndex={0} onClick={() => ui.openAsset(h.assetId)} onKeyDown={(e) => { if (e.key === "Enter") ui.openAsset(h.assetId); }}>
                  <td><span className="asset-tag"><Icon name={CATEGORY_ICON[h.category]} /><b>{h.assetTag}</b></span><span className="sku">{h.manufacturer} {h.modelName}</span></td>
                  <td>{h.assignedTo ?? <span className="muted">Shared</span>}{h.department && <span className="sku">{h.department}</span>}</td>
                  <td>{h.checkedOn ? <>{fmtDay(h.checkedOn)}{h.flagNotChecked
                    ? <span className="late block">{h.daysSinceCheck} days ago</span> : <span className="sku">{h.daysSinceCheck === 0 ? "today" : `${h.daysSinceCheck} ${h.daysSinceCheck === 1 ? "day" : "days"} ago`}</span>}</>
                    : <span className="late">Never</span>}</td>
                  <td>{h.osVersion ?? <span className="muted">-</span>}</td>
                  <td>{h.bitlockerOn === null ? <span className="muted">-</span> : h.bitlockerOn ? <span className="pill-s st-complete">On</span> : <span className="pill-s st-overdue">Off</span>}</td>
                  <td>{h.diskFreePct === null ? <span className="muted">-</span> : (
                    <span className="disk"><Prog fraction={h.diskFreePct / 100} tone={h.flagLowDisk ? "short" : "complete"} delay={Math.min(i, 20) * 25} /><b className="tnum">{h.diskFreePct}%</b></span>)}</td>
                  <td className="r tnum">{h.pendingUpdates === null ? <span className="muted">-</span> : <b className={h.flagUpdates ? "warn-text" : ""}>{h.pendingUpdates}</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          Sample check-ins for the demo. The PowerShell health-check script (a separate project) is meant to send real ones: source = &apos;health_check&apos;.
        </p>
      </section>
    </>
  );
}
