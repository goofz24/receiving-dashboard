"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DashboardData, LineStatus } from "@/lib/data";
import { SQL_BY_CARD, type SqlKey } from "@/lib/queries";
import { Icon, type IconName } from "./icons";
import { Ask } from "./pages/Ask";
import { Assets } from "./pages/Assets";
import { Health } from "./pages/Health";
import { ItOverview, type AssetTab } from "./pages/ItOverview";
import { Licenses } from "./pages/Licenses";
import { Lifecycle } from "./pages/Lifecycle";
import { AssetHistory, NotSetUp } from "./it-ui";
import { Deliveries } from "./pages/Deliveries";
import { Mismatches } from "./pages/Mismatches";
import { Orders } from "./pages/Orders";
import { Overview } from "./pages/Overview";
import { Suppliers } from "./pages/Suppliers";
import { highlightSql } from "./SqlCode";
import { UiContext, type Ui } from "./ui";
import { MANAGER_NAME } from "@/lib/view-helpers";

const PAGES = ["overview", "ask", "deliveries", "orders", "mismatches", "suppliers", "it", "assets", "lifecycle", "health", "licenses"] as const;
type Page = (typeof PAGES)[number];
const LABEL: Record<Page, string> = {
  overview: "Overview", ask: "Ask AI", deliveries: "Deliveries", orders: "Purchase orders", mismatches: "Mismatches", suppliers: "Suppliers",
  it: "IT overview", assets: "Assets", lifecycle: "Warranty & refresh", health: "Device health", licenses: "Licenses",
};
const ICON: Record<Page, IconName> = {
  overview: "home", ask: "sparkles", deliveries: "truck", orders: "clipboard", mismatches: "alert", suppliers: "building",
  it: "laptop", assets: "box", lifecycle: "refresh", health: "pulse", licenses: "key",
};
const GROUPS: [string, Page[]][] = [
  ["Dashboard", ["overview", "ask"]], ["Receiving", ["deliveries", "orders", "mismatches"]], ["Partners", ["suppliers"]],
  ["IT assets", ["it", "assets", "lifecycle", "health", "licenses"]],
];

const IT_PAGES = new Set<Page>(["it", "assets", "lifecycle", "health", "licenses"]);

type Modal = { title: string; sub?: string; body: ReactNode } | null;
type PalItem = { label: string; kind: string; icon: IconName; go: () => void };

export function Dashboard({ data, aiEnabled, askLimit, askUsed }: { data: DashboardData; aiEnabled: boolean; askLimit: number; askUsed: number }) {
  const [page, setPage] = useState<Page>("overview");
  const [leaving, setLeaving] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dark, setDark] = useState<boolean | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [palOpen, setPalOpen] = useState(false);
  const [used, setUsed] = useState(askUsed);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderTab, setOrderTab] = useState<LineStatus | "all">("overdue");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetTab, setAssetTab] = useState<AssetTab>("all");
  const stage = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  // ---- hash routing with a short fade-out before the next page rises in ----
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const read = (first: boolean) => {
      const h = window.location.hash.replace("#", "") as Page;
      const next = PAGES.includes(h) ? h : "overview";
      setDrawer(false);
      if (first) { setPage(next); return; }
      setLeaving(true);
      clearTimeout(t);
      t = setTimeout(() => { setPage(next); setLeaving(false); stage.current?.scrollTo({ top: 0 }); }, 160);
    };
    read(true);
    const onHash = () => read(false);
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("hashchange", onHash); clearTimeout(t); };
  }, []);
  const go = useCallback((p: string) => {
    if (window.location.hash === `#${p}`) { setPage(p as Page); return; }
    window.location.hash = p;
  }, []);
  const openOrders = useCallback((q: string) => { setOrderTab("all"); setOrderQuery(q); go("orders"); }, [go]);
  const openAssets = useCallback((q: string, tab: AssetTab = "all") => { setAssetTab(tab); setAssetQuery(q); go("assets"); }, [go]);

  // ---- sliding highlight behind the active menu item ----
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLElement>(`a[data-page="${page}"]`);
      if (a && pill.current) { pill.current.style.transform = `translateY(${a.offsetTop}px)`; pill.current.style.height = `${a.offsetHeight}px`; }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [page]);

  // ---- light / dark ----
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("rd-theme"); } catch {}
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
    setDark(saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("rd-theme", next); } catch {}
    setDark(!dark);
  };

  // ---- toast, modal, copy, SQL viewer ----
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);
  const openModal = useCallback((m: Modal) => { lastFocus.current = document.activeElement as HTMLElement; setModal(m); }, []);
  const closeModal = useCallback(() => { setModal(null); lastFocus.current?.focus(); }, []);
  const copy = useCallback(async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch {
      openModal({ title: "Copy this text", sub: "Your browser blocked automatic copying. Select the text and press Ctrl C.",
        body: <textarea className="copybox" readOnly defaultValue={text} autoFocus onFocus={(e) => e.currentTarget.select()} /> });
    }
  }, [toast, openModal]);
  const showSql = useCallback((key: SqlKey) => {
    const q = SQL_BY_CARD[key];
    openModal({ title: q.title, sub: "The query the dashboard runs for this card, as the read-only user.", body: (
      <>
        <pre className="code" dangerouslySetInnerHTML={{ __html: highlightSql(q.sql) }} />
        <div className="modal-actions"><button type="button" className="btn sm" onClick={() => copy(q.sql, "SQL copied")}><Icon name="copy" />Copy SQL</button></div>
      </>
    ) });
  }, [openModal, copy]);
  const openAsset = useCallback((assetId: number) => {
    const a = data.itam?.assets.find((x) => x.assetId === assetId);
    if (!a || !data.itam) return;
    openModal({ title: a.assetTag, sub: `${a.manufacturer} ${a.modelName}`, body: (
      <>
        <AssetHistory asset={a} events={data.itam.assetEvents.filter((e) => e.assetId === assetId)} />
        <div className="modal-actions"><button type="button" className="btn sm" onClick={() => showSql("assetEvents")}><Icon name="code" />Show the SQL</button></div>
      </>
    ) });
  }, [data.itam, openModal, showSql]);
  const ui: Ui = useMemo(() => ({ toast, copy, showSql, openAsset }), [toast, copy, showSql, openAsset]);
  const showAllSql = () => openModal({ title: "Every query on this dashboard", sub: "Click one to read it.", body: (
    <div className="list">
      {(Object.keys(SQL_BY_CARD) as SqlKey[]).map((k) => (
        <button key={k} type="button" className="li" onClick={() => showSql(k)}>
          <span className="chip-ico"><Icon name="code" /></span>
          <span style={{ minWidth: 0 }}><span className="t block">{SQL_BY_CARD[k].title}</span><span className="s block">{SQL_BY_CARD[k].sql.split("\n")[0]}…</span></span>
          <Icon name="arrow" />
        </button>
      ))}
    </div>
  ) });

  // ---- command palette (Ctrl K) ----
  const palItems: PalItem[] = useMemo(() => [
    ...PAGES.map((p) => ({ label: LABEL[p], kind: "Page", icon: ICON[p], go: () => go(p) })),
    ...data.suppliers.map((s) => ({ label: s.supplier, kind: "Supplier", icon: "building" as IconName, go: () => openOrders(s.supplier) })),
    ...[...new Set(data.orderLines.map((l) => l.poNumber))].sort().map((po) => ({ label: po, kind: "Order", icon: "clipboard" as IconName, go: () => openOrders(po) })),
    ...[...new Map(data.orderLines.map((l) => [l.sku, l])).values()].map((l) => ({ label: `${l.product} · ${l.sku}`, kind: "Product", icon: "box" as IconName, go: () => openOrders(l.sku) })),
    ...(data.itam?.assets ?? []).map((a) => ({ label: `${a.assetTag} · ${a.manufacturer} ${a.modelName}${a.assignedTo ? ` · ${a.assignedTo}` : ""}`, kind: "Asset", icon: "laptop" as IconName, go: () => openAsset(a.assetId) })),
    ...[...new Set((data.itam?.assets ?? []).map((a) => a.assignedTo).filter((x): x is string => Boolean(x)))].sort().map((name) => ({ label: name, kind: "Person", icon: "userplus" as IconName, go: () => openAssets(name) })),
  ], [data, go, openOrders, openAssets, openAsset]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); lastFocus.current = document.activeElement as HTMLElement; setPalOpen((o) => !o); }
      if (e.key === "Escape") { setPalOpen(false); if (modal) closeModal(); setDrawer(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  const counts: Partial<Record<Page, { n: number; alert?: boolean }>> = {
    deliveries: { n: data.kpis.deliveries7d }, orders: { n: data.kpis.overdueLines, alert: true },
    mismatches: { n: data.mismatches.length, alert: true }, suppliers: { n: data.suppliers.length },
    ...(data.itam ? {
      it: { n: data.itam.itKpis.withLeavers + data.itam.itKpis.bitlockerOff, alert: true }, assets: { n: data.itam.itKpis.activeAssets },
      lifecycle: { n: data.itam.itKpis.warrantyEnding90d }, health: { n: data.itam.deviceHealth.filter((h) => h.flagBitlocker || h.flagLowDisk || h.flagUpdates || h.flagNotChecked).length, alert: true },
      licenses: { n: data.itam.licenses.filter((l) => l.seatsFree < 0).length, alert: true },
    } : {}),
  };

  return (
    <UiContext.Provider value={ui}>
      <div className="sea" aria-hidden="true"><i className="blob b1" /><i className="blob b2" /><i className="blob b3" /></div>
      <div className={`shell${drawer ? " drawer" : ""}`}>
        <aside className="side glass" id="side" aria-label="Main menu">
          <div className="brand">
            <div className="brand-mark"><Icon name="package" /></div>
            <div><b>Receiving</b><small>Dock + IT dashboard</small></div>
          </div>
          <nav className="nav" ref={nav}>
            <div className="nav-pill" ref={pill} />
            {GROUPS.map(([group, pages]) => (
              <div key={group}>
                <div className="nav-group">{group}</div>
                {pages.map((p) => (
                  <a key={p} href={`#${p}`} data-page={p} aria-current={p === page ? "page" : undefined}>
                    <Icon name={ICON[p]} />{LABEL[p]}
                    {counts[p] && counts[p]!.n > 0 && <span className={`count${counts[p]!.alert ? " alert" : ""}`}>{counts[p]!.n}</span>}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <div><span className="dot" /><b>Postgres</b> · read-only user</div>
            <div className="row"><span>AI questions today</span><b className="tnum">{aiEnabled ? `${used} of ${askLimit}` : "off"}</b></div>
            <div className="meter"><i style={{ transform: `scaleX(${aiEnabled && askLimit ? Math.max(0.02, used / askLimit) : 0.02})` }} /></div>
            <div className="row"><span>All data is made up</span></div>
          </div>
        </aside>
        {drawer && <button type="button" className="drawer-scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}

        <div className="col">
          <header className="top">
            <button type="button" className="round menu-btn" aria-label="Open menu" aria-controls="side" aria-expanded={drawer} onClick={() => setDrawer((d) => !d)}><Icon name="menu" /></button>
            <button type="button" className="search glass" onClick={() => { lastFocus.current = document.activeElement as HTMLElement; setPalOpen(true); }} aria-label="Search orders, suppliers, assets, people and pages">
              <Icon name="search" /><span className="stext">Search orders, suppliers, assets, people…</span><kbd>Ctrl K</kbd>
            </button>
            <div className="top-right">
              <button type="button" className="round hide-sm" onClick={toggleTheme} aria-label="Switch light or dark">{dark === null ? <Icon name="moon" /> : <Icon name={dark ? "sun" : "moon"} />}</button>
              <button type="button" className="round light hide-sm" onClick={showAllSql} aria-label="Show every SQL query"><Icon name="code" /></button>
              <div className="me"><span className="avatar">{MANAGER_NAME[0]}</span><div><b>{MANAGER_NAME}</b><small>Receiving manager</small></div></div>
            </div>
          </header>
          <div className="stage glass" ref={stage}>
            <main className={`view${leaving ? " leaving" : ""}`} key={page}>
              {page === "overview" && <Overview data={data} go={go} />}
              {page === "deliveries" && <Deliveries data={data} />}
              {page === "orders" && <Orders data={data} query={orderQuery} setQuery={setOrderQuery} tab={orderTab} setTab={setOrderTab} />}
              {page === "suppliers" && <Suppliers data={data} openOrders={openOrders} />}
              {page === "mismatches" && <Mismatches data={data} openOrders={openOrders} />}
              {page === "ask" && <Ask enabled={aiEnabled} limit={askLimit} used={used} onUsed={() => setUsed((u) => u + 1)} />}
              {IT_PAGES.has(page) && !data.itam && <><div className="head rise"><div><h1>{LABEL[page]}</h1></div></div><NotSetUp /></>}
              {data.itam && page === "it" && <ItOverview it={data.itam} go={go} openAssets={openAssets} />}
              {data.itam && page === "assets" && <Assets it={data.itam} query={assetQuery} setQuery={setAssetQuery} tab={assetTab} setTab={setAssetTab} />}
              {data.itam && page === "lifecycle" && <Lifecycle it={data.itam} />}
              {data.itam && page === "health" && <Health it={data.itam} />}
              {data.itam && page === "licenses" && <Licenses it={data.itam} />}
              <footer className="foot rise">All data on this page is made up for a portfolio demo. Built with Claude Code.</footer>
            </main>
          </div>
        </div>
      </div>

      {modal && (
        <div className="scrim on" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="sheet">
            <div className="sheet-head">
              <div><h3 id="modal-title">{modal.title}</h3>{modal.sub && <p>{modal.sub}</p>}</div>
              <button type="button" className="x" onClick={closeModal} aria-label="Close" autoFocus><Icon name="x" /></button>
            </div>
            {modal.body}
          </div>
        </div>
      )}
      {palOpen && <Palette items={palItems} onClose={() => { setPalOpen(false); lastFocus.current?.focus(); }} />}
      <div className={`toast${toastMsg ? " on" : ""}`} role="status" aria-live="polite">{toastMsg && <><Icon name="check" />{toastMsg}</>}</div>
    </UiContext.Provider>
  );
}

function Palette({ items, onClose }: { items: PalItem[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const query = q.trim().toLowerCase();
  const shown = (query ? items.filter((i) => i.label.toLowerCase().includes(query)) : items).slice(0, 9);
  const pick = (i: PalItem | undefined) => { if (!i) return; onClose(); i.go(); };
  return (
    <div className="scrim on" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="pal-input">
          <Icon name="search" />
          <input autoFocus value={q} placeholder="Type a page, supplier, PO, product, asset tag or person" aria-controls="pal-list"
            aria-activedescendant={shown.length ? `pal-${Math.min(sel, shown.length - 1)}` : undefined}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(shown[Math.min(sel, shown.length - 1)]); }
            }} />
          <kbd className="kbd-plain">Esc</kbd>
        </div>
        <ul className="pal-list" id="pal-list" role="listbox">
          {shown.length === 0 && <li className="muted">No matches</li>}
          {shown.map((i, k) => (
            <li key={i.kind + i.label} id={`pal-${k}`} role="option" aria-selected={k === Math.min(sel, shown.length - 1)} onMouseEnter={() => setSel(k)} onClick={() => pick(i)}>
              <Icon name={i.icon} />{i.label}<span className="kind">{i.kind}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
