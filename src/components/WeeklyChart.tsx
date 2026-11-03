"use client";

import { useState } from "react";
import type { WeekRow } from "@/lib/data";
import { fmtDay, fmtInt } from "@/lib/format";

// A simple bar chart drawn with SVG: one bar per week.
export function WeeklyChart({ weeks }: { weeks: WeekRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 220, left = 44, bottom = 24, top = 12, right = 8;
  const max = Math.max(10, ...weeks.map((w) => w.unitsReceived));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const plotW = W - left - right, plotH = H - top - bottom;
  const slot = plotW / weeks.length;
  const barW = Math.max(6, slot - 6);
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Units received per week, last 12 weeks">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={left - 6} y={y(t) + 4} className="axis" textAnchor="end">{fmtInt(t)}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = left + i * slot + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(w.unitsReceived));
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* invisible, taller hit area so the bar is easy to hover */}
              <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" />
              <path d={roundedTop(x, y(w.unitsReceived), barW, h)} className={hover === i ? "bar bar-hover" : "bar"} />
              {i % 2 === 0 && (
                <text x={x + barW / 2} y={H - 6} className="axis" textAnchor="middle">{fmtDay(w.weekStart)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-tip" aria-live="polite">
        {hover === null
          ? "Hover a bar to see the week."
          : `Week of ${fmtDay(weeks[hover].weekStart)}: ${fmtInt(weeks[hover].unitsReceived)} units`}
      </div>
      <details className="sql">
        <summary>Show as a table</summary>
        <table>
          <thead><tr><th>Week of</th><th className="num">Units received</th></tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart}><td>{fmtDay(w.weekStart)}</td><td className="num">{fmtInt(w.unitsReceived)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
}

// bar with 4px rounded top corners, flat on the baseline
function roundedTop(x: number, yTop: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yTop + h} Z`;
}
