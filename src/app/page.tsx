import { Dashboard } from "@/components/Dashboard";
import { getDashboardData } from "@/lib/data";
import { getPool } from "@/lib/db";
import { ASK_LIMIT, askLimiter } from "@/lib/daily-limit";

// Always read fresh numbers from the database; never cache the page.
export const dynamic = "force-dynamic";

export default async function Page() {
  let data;
  try {
    data = await getDashboardData(getPool());
  } catch (err) {
    return (
      <main className="db-error">
        <section className="card">
          <h1>Can&apos;t reach the database</h1>
          <p className="bad-text">{err instanceof Error ? err.message : String(err)}</p>
          <p>Check DATABASE_URL in .env.local. The README has the setup steps.</p>
        </section>
      </main>
    );
  }
  return (
    <Dashboard data={data} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} askLimit={ASK_LIMIT} askUsed={askLimiter.usedToday()} />
  );
}
