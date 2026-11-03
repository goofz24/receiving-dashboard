import { AskBox } from "@/components/AskBox";
import { KpiTiles } from "@/components/KpiTiles";
import { MismatchTable } from "@/components/MismatchTable";
import { Panel } from "@/components/Panel";
import { SupplierTable } from "@/components/SupplierTable";
import { WeeklyChart } from "@/components/WeeklyChart";
import { getKpis, getMismatches, getSupplierTotals, getWeeklyUnits } from "@/lib/data";
import { getPool } from "@/lib/db";
import { KPI_SQL, MISMATCHES_SQL, SUPPLIER_TOTALS_SQL, WEEKLY_UNITS_SQL } from "@/lib/queries";

// Always read fresh numbers from the database; never cache the page.
export const dynamic = "force-dynamic";

export default async function Page() {
  let data;
  try {
    const pool = getPool();
    const [kpis, suppliers, weeks, mismatches] = await Promise.all([
      getKpis(pool), getSupplierTotals(pool), getWeeklyUnits(pool), getMismatches(pool),
    ]);
    data = { kpis, suppliers, weeks, mismatches };
  } catch (err) {
    return (
      <main>
        <Header />
        <section className="panel panel-wide">
          <h2>Can&apos;t reach the database</h2>
          <p className="msg msg-bad">{err instanceof Error ? err.message : String(err)}</p>
          <p className="panel-desc">Check DATABASE_URL in .env.local. The README has the setup steps.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <Header />
      <KpiTiles kpis={data.kpis} />
      <details className="sql sql-kpi">
        <summary>Show the SQL for these numbers</summary>
        <pre><code>{KPI_SQL}</code></pre>
      </details>

      <div className="grid">
        <Panel title="Units received per week" description="Last 12 weeks, all suppliers." sql={WEEKLY_UNITS_SQL}>
          <WeeklyChart weeks={data.weeks} />
        </Panel>
        <Panel
          title="Supplier totals"
          description="Orders that were already due. Fill rate = share of ordered units that arrived."
          sql={SUPPLIER_TOTALS_SQL}
        >
          <SupplierTable rows={data.suppliers} />
        </Panel>
      </div>

      <Panel
        wide
        title="Count mismatches"
        description="Order lines where the delivered count didn't match the order, or units arrived damaged. Most recent first."
        sql={MISMATCHES_SQL}
      >
        <MismatchTable rows={data.mismatches} />
      </Panel>

      <Panel
        wide
        title="Ask a question (AI, read-only)"
        description="Claude writes one SELECT query for your question. You see the query, and it runs as a read-only user."
      >
        <AskBox enabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
      </Panel>

      <footer>All data on this page is made up for a portfolio demo. Built with Claude Code.</footer>
    </main>
  );
}

function Header() {
  return (
    <header>
      <div>
        <h1>Receiving Dashboard</h1>
        <p className="panel-desc">Deliveries, supplier totals and count mismatches from a Postgres database.</p>
      </div>
      <span className="badge">Sample data</span>
    </header>
  );
}
