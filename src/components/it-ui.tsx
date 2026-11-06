"use client";

// Small pieces shared by the IT asset pages.
import type { CSSProperties } from "react";
import type { AssetCategory, AssetEventRow, AssetRow, AssetStatus } from "@/lib/itam-data";
import { fmtDay, fmtMoney } from "@/lib/format";
import { ASSET_STATUS_LABEL, ASSET_STATUSES, CATEGORY_LABEL, EVENT_LABEL, ageText, statusMatrix, warrantyText } from "@/lib/itam-helpers";
import { Icon, type IconName } from "./icons";
import { rise } from "./ui";

export const CATEGORY_ICON: Record<AssetCategory, IconName> = {
  laptop: "laptop", desktop: "laptop", monitor: "open", phone: "send", tablet: "clipboard", dock: "box", printer: "copy",
};

export function AssetPill({ status }: { status: AssetStatus }) {
  return <span className={`pill-s as-${status}`}>{ASSET_STATUS_LABEL[status]}</span>;
}

// Shown on the IT pages when sql/04 to 06 haven't been run in this database yet.
export function NotSetUp() {
  return (
    <section {...rise(1, "card")}>
      <h2>The IT asset tables aren&apos;t in this database yet</h2>
      <p className="sub" style={{ marginTop: 8 }}>
        In Supabase, open <b>SQL Editor</b> and run <code>sql/04_itam_schema.sql</code>, <code>sql/05_itam_seed.sql</code> and
        {" "}<code>sql/06_itam_security.sql</code>, in that order. Then reload this page. The receiving pages work without them.
      </p>
    </section>
  );
}

// One bar per device type, split by status.
export function StatusBars({ rows, onPick }: { rows: Parameters<typeof statusMatrix>[0]; onPick?: (c: AssetCategory) => void }) {
  const m = statusMatrix(rows);
  const max = Math.max(1, ...m.map((r) => r.total));
  const used = ASSET_STATUSES.filter((s) => m.some((r) => r[s] > 0));
  return (
    <div className="sbars">
      {m.map((r, i) => (
        <button key={r.category} type="button" className="sbar-row" onClick={() => onPick?.(r.category)} title={`Show all ${CATEGORY_LABEL[r.category].toLowerCase()}`}>
          <span className="sbar-lbl">{CATEGORY_LABEL[r.category]}</span>
          <span className="sbar-track" style={{ width: `${(100 * r.total) / max}%` }}>
            {used.filter((s) => r[s] > 0).map((s) => (
              <i key={s} className={`seg-${s}`} style={{ flexGrow: r[s], ["--j" as string]: i } as CSSProperties} title={`${ASSET_STATUS_LABEL[s]}: ${r[s]}`} />
            ))}
          </span>
          <b className="tnum">{r.total}</b>
        </button>
      ))}
      <div className="sbar-legend">
        {used.map((s) => <span key={s}><i className={`seg-${s}`} />{ASSET_STATUS_LABEL[s]}</span>)}
      </div>
    </div>
  );
}

// The body of the "asset history" sheet: facts at the top, then every event as a timeline.
export function AssetHistory({ asset, events }: { asset: AssetRow; events: AssetEventRow[] }) {
  return (
    <div className="asset-sheet">
      <div className="chips">
        <AssetPill status={asset.status} />
        <span className="tag"><Icon name={CATEGORY_ICON[asset.category]} />{asset.manufacturer} {asset.modelName}</span>
        <span className="tag"><Icon name="pin" />{asset.location}</span>
      </div>
      <div className="facts">
        <div><small>Assigned to</small><b>{asset.assignedTo ?? (asset.status === "deployed" ? "Shared / not recorded" : "Nobody")}</b>
          {asset.ownerLeftOn && <span className="late">Left {fmtDay(asset.ownerLeftOn)}</span>}</div>
        <div><small>Serial number</small><b className="mono">{asset.serialNumber}</b></div>
        <div><small>Bought</small><b>{fmtDay(asset.purchasedOn)} {asset.purchasedOn.slice(0, 4)}</b><span className="muted small">{fmtMoney(asset.purchaseCost)} · {asset.vendor} · {asset.invoiceNumber}</span></div>
        <div><small>Warranty</small><b>{fmtDay(asset.warrantyEndsOn)} {asset.warrantyEndsOn.slice(0, 4)}</b>
          <span className={asset.warrantyDaysLeft < 0 ? "muted small" : asset.warrantyDaysLeft <= 90 ? "warn-text small" : "muted small"}>{warrantyText(asset.warrantyDaysLeft)}</span></div>
        <div><small>Age</small><b>{ageText(asset.ageMonths)}</b><span className="muted small">Replace by {fmtDay(asset.refreshDueOn)} {asset.refreshDueOn.slice(0, 4)}</span></div>
      </div>
      <h3 className="tl-title">History</h3>
      <ol className="timeline">
        {events.map((e, i) => (
          <li key={e.eventId} className={`tl-${e.eventType}`} style={{ ["--i" as string]: i } as CSSProperties}>
            <span className="tl-dot" />
            <div>
              <b>{EVENT_LABEL[e.eventType] ?? e.eventType}{e.employee && <> {e.eventType === "returned" ? "by" : "to"} {e.employee}</>}</b>
              <span className="muted small">{fmtDay(e.eventOn)} {e.eventOn.slice(0, 4)} · {e.doneBy}</span>
              {e.note && <span className="small">{e.note}</span>}
            </div>
          </li>
        ))}
      </ol>
      <p className="muted small" style={{ margin: 0 }}>The status at the top comes from the newest event. Nobody types it in, so it can&apos;t drift from the history.</p>
    </div>
  );
}
