import type { Pool, PoolClient } from "pg";

export const MAX_ROWS = 200;
export const AI_QUERY_TIMEOUT_MS = 3000;

// Confirms the app is logged in as a user that CANNOT change data.
// If someone put the owner's connection string in DATABASE_URL by
// mistake, the AI box refuses to run instead of trusting it.
export async function assertReadOnlyUser(client: PoolClient): Promise<void> {
  const { rows } = await client.query(`
    select r.rolname,
           r.rolsuper,
           r.rolbypassrls,
           exists (
             select 1
             from pg_tables t
             where t.schemaname = 'receiving'
               and (has_table_privilege(current_user, format('%I.%I', t.schemaname, t.tablename), 'INSERT')
                 or has_table_privilege(current_user, format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
                 or has_table_privilege(current_user, format('%I.%I', t.schemaname, t.tablename), 'DELETE')
                 or has_table_privilege(current_user, format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE'))
           ) as can_write
    from pg_roles r
    where r.rolname = current_user`);
  const me = rows[0];
  if (!me || me.rolsuper || me.rolbypassrls || me.can_write) {
    throw new ReadOnlyUserError(
      `The AI box only runs as a read-only user, but the app is connected as "${me?.rolname ?? "unknown"}", which can change data. Use the dashboard_reader connection string.`,
    );
  }
}

export class ReadOnlyUserError extends Error {}

// Runs an already-checked SELECT inside a READ ONLY transaction with a
// time limit, and never returns more than MAX_ROWS rows. The transaction
// is always rolled back, so nothing it did could stick even in theory.
export async function runReadOnlyQuery(pool: Pool, sql: string) {
  const client = await pool.connect();
  try {
    await client.query("begin transaction read only");
    await client.query(`set local statement_timeout = ${AI_QUERY_TIMEOUT_MS}`);
    await client.query("set local search_path = receiving");
    await assertReadOnlyUser(client);
    // Wrapping the query as a sub-select means it must be ONE select,
    // and lets us add our own LIMIT on top of whatever it says.
    const result = await client.query({ text: `select * from (${sql}) as answer limit ${MAX_ROWS + 1}`, rowMode: "array" });
    const truncated = result.rows.length > MAX_ROWS;
    return {
      columns: result.fields.map((f) => f.name),
      rows: (truncated ? result.rows.slice(0, MAX_ROWS) : result.rows) as unknown[][],
      truncated,
    };
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
