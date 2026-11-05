"use client";

import { useState, type CSSProperties } from "react";
import { fmtDay, fmtInt, fmtK, fmtMoney } from "@/lib/format";
import { niceScale, supplierColor, type WeekTotal } from "@/lib/view-helpers";
import { Count } from "./ui";

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// Bar chart drawn with plain HTML. Bars grow with a CSS animation the first time
// (and again when `key` changes), then glide to new heights when the filter changes.
export function WeeklyBars({ weeks }: { weeks: WeekTotal[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { top, ticks } = niceScale(Math.max(0, ...weeks.map((w) => w.units)));
  let hi = -1;
  weeks.forEach((w, i) => { if (w.units > 0) hi = i; });
  const n = weeks.length;
  const pctOf = (x: number) => `${(100 * x) / top}%`;
  return (
    <div className="chart">
      <div className="yaxis" aria-hidden="true">{ticks.map((t) => <span key={t} style={{ bottom: pctOf(t) }}>{fmtInt(t)}</span>)}</div>
      <div className="plot" role="img" aria-label={`Units received per week: ${weeks.map((w) => `${fmtDay(w.weekStart)} ${w.units}`).join(", ")}`}>
        {ticks.map((t) => <div key={t} className="gl" style={{ bottom: pctOf(t) }} />)}
        <div className="cols">
          {weeks.map((w, i) => (
            <div key={w.weekStart} className={`bcol${i === hi ? " hi" : ""}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className="bar"><i style={v({ transform: `scaleY(${w.units / top})`, "--j": i })} /></div>
              {(n <= 8 || i % 2 === (n - 1) % 2) && <span className="xlab">{fmtDay(w.weekStart)}</span>}
            </div>
          ))}
        </div>
        {hi >= 0 && (
          <span className="bar-tag" style={{ left: `${((hi + 0.5) * 100) / n}%`, bottom: pctOf(weeks[hi].units) }}>
            <Count value={weeks[hi].units} duration={900} />
          </span>
        )}
        <div className={`tip${hover !== null ? " on" : ""}`}
          style={hover !== null ? { left: `${((hover + 0.5) * 100) / n}%`, bottom: pctOf(weeks[hover].units) } : undefined}>
          {hover !== null && (<><b>{fmtInt(weeks[hover].units)} units</b>Week of {fmtDay(weeks[hover].weekStart)} · {weeks[hover].deliveries} {weeks[hover].deliveries === 1 ? "delivery" : "deliveries"}</>)}
        </div>
      </div>
    </div>
  );
}

export type DonutSlice = { id: number; name: string; value: number };

export function SupplierDonut({ slices, picked, onPick }: { slices: DonutSlice[]; picked: number | null; onPick: (id: number | null) => void }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 52, C = 2 * Math.PI * r, gap = 2.2;
  let acc = 0;
  const arcs = slices.map((s) => {
    const len = total ? (C * s.value) / total : 0;
    const a = { ...s, len: Math.max(0, len - gap), off: acc };
    acc += len;
    return a;
  });
  const pickedSlice = slices.find((s) => s.id === picked);
  const toggle = (id: number) => onPick(picked === id ? null : id);
  return (
    <div className="donut-wrap">
      <div className={`donut${picked ? " picked" : ""}`}>
        <svg viewBox="0 0 120 120" role="img" aria-label="Value received by supplier">
          <circle className="track" cx="60" cy="60" r={r} />
          {arcs.map((a, i) => (
            <circle key={a.id} className={`seg-arc${a.id === picked ? " on" : ""}`} cx="60" cy="60" r={r}
              stroke={supplierColor(a.id)} strokeDasharray={`${a.len} ${C}`} strokeDashoffset={-a.off}
              style={v({ "--j": i })} onClick={() => toggle(a.id)}>
              <title>{`${a.name}: ${fmtMoney(a.value)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="donut-center">
          <b><Count value={pickedSlice ? pickedSlice.value : total} format="k" duration={800} /></b>
          <small>{pickedSlice ? pickedSlice.name : "received"}</small>
        </div>
      </div>
      <div className={`legend${picked ? " picked" : ""}`}>
        {slices.map((s) => (
          <button key={s.id} type="button" className={s.id === picked ? "on" : ""} aria-pressed={s.id === picked} onClick={() => toggle(s.id)}>
            <span className="sw" style={{ background: supplierColor(s.id) }} /><span>{s.name}</span><b className="tnum">{fmtK(s.value)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Ring({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const C = 2 * Math.PI * 32;
  return (
    <div className="ring">
      <svg viewBox="0 0 74 74" aria-hidden="true">
        <circle className="bg" cx="37" cy="37" r="32" />
        <circle className="fg" cx="37" cy="37" r="32" stroke={color} strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(100, pct) / 100)} style={v({ "--c": C, animationDelay: `${delay}ms` })} />
      </svg>
      <b><Count value={pct} format="pct" /></b>
    </div>
  );
}

export function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values), W = 100, H = 40;
  const pts = values.map((x, i) => [(i * W) / (values.length - 1), H - 3 - (x / max) * (H - 6)]);
  const line = "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
  return (
    <div className="spark">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="area" d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#g${id})`} />
        <path className="line" d={line} stroke={color} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function Prog({ fraction, tone, delay = 0, color }: { fraction: number; tone?: string; delay?: number; color?: string }) {
  return (
    <div className={`prog ${tone ?? ""}`}>
      <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, fraction))})`, animationDelay: `${delay}ms`, background: color }} />
    </div>
  );
}
