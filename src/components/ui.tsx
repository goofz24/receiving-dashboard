"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { LineStatus } from "@/lib/data";
import { FORMATS, type FormatName } from "@/lib/format";
import { STATUS_LABEL, supplierColor, trendPct } from "@/lib/view-helpers";
import { SQL_BY_CARD, type SqlKey } from "@/lib/queries";
import { Icon, type IconName } from "./icons";

// ---- shared actions (toast, copy, SQL viewer), provided by Dashboard ----
export type Ui = { toast: (msg: string) => void; copy: (text: string, done: string) => void; showSql: (key: SqlKey) => void };
export const UiContext = createContext<Ui>({ toast: () => {}, copy: () => {}, showSql: () => {} });
export const useUi = () => useContext(UiContext);

// Counts up to `value` with requestAnimationFrame, which runs at the screen's refresh rate.
// It writes straight to the DOM, so React doesn't re-render 120 times a second.
// The server sends the real number, so the page reads correctly before any animation.
export function Count({ value, format = "int", duration = 1000 }: { value: number; format?: FormatName; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = FORMATS[format];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(value); from.current = value; return; }
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      el.textContent = fmt(start + (value - start) * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    from.current = value;
    return () => cancelAnimationFrame(raf);
  }, [value, format, duration]);
  return <span ref={ref} className="tnum">{FORMATS[format](value)}</span>;
}

// Segmented control with a pill that slides to the chosen option.
export function Seg<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const on = wrap.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (on && pill.current) { pill.current.style.width = `${on.offsetWidth}px`; pill.current.style.transform = `translateX(${on.offsetLeft}px)`; }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [value, options.length]);
  return (
    <div className="seg" role="group" aria-label={label} ref={wrap}>
      <span className="pill" ref={pill} />
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ status }: { status: LineStatus | "damaged" }) {
  return <span className={`pill-s st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function SupTag({ id, name }: { id: number; name: string }) {
  return <span className="sup"><i style={{ background: supplierColor(id) }} /><span>{name}</span></span>;
}

export function Trend({ now, prev, upIsGood = true }: { now: number; prev: number; upIsGood?: boolean }) {
  const ch = trendPct(now, prev);
  if (ch === null) return <span className="trend flat">new</span>;
  if (ch === 0) return <span className="trend flat">0%</span>;
  const good = (ch > 0) === upIsGood;
  return (
    <span className={`trend ${good ? "up" : "down"}`} title="Compared with the period before">
      <Icon name={ch > 0 ? "up" : "down"} />{Math.abs(ch)}%
    </span>
  );
}

export function SqlButton({ k }: { k: SqlKey }) {
  const { showSql } = useUi();
  return (
    <button type="button" className="sql-btn" onClick={() => showSql(k)} aria-label={`Show the SQL: ${SQL_BY_CARD[k].title}`} title={`Show the SQL: ${SQL_BY_CARD[k].title}`}>
      <Icon name="code" />
    </button>
  );
}

export function ChipIcon({ name }: { name: IconName }) {
  return <span className="chip-ico"><Icon name={name} /></span>;
}

// Blocks rise in one after another. --i sets each one's delay.
export const rise = (i: number, className = "") => ({ className: `${className} rise`.trim(), style: { ["--i" as string]: i } as CSSProperties });

export function KpiCard({ icon, value, format = "int", label, hint, extra }: {
  icon: IconName; value: number; format?: FormatName; label: string; hint?: string; extra?: ReactNode;
}) {
  return (
    <section className="card kpi lift">
      <div className="kpi-top"><ChipIcon name={icon} />{extra}</div>
      <div className="val"><Count value={value} format={format} /></div>
      <div className="lbl">{label}</div>
      {hint && <div className="hint">{hint}</div>}
    </section>
  );
}
