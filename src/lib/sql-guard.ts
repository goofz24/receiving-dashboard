// Checks a query written by the AI BEFORE it goes near the database.
//
// This is only the first of several safety layers. The real protection is
// that the app logs in as dashboard_reader (can only SELECT) inside a
// READ ONLY transaction with a time limit. This check just rejects the
// obvious bad cases early, with a clear message.

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

export const MAX_SQL_LENGTH = 4000;

// Words that should never appear in a read-only report query.
const BLOCKED_WORDS = [
  "insert", "update", "delete", "merge", "upsert", "drop", "alter", "create", "truncate",
  "grant", "revoke", "comment", "copy", "call", "do", "execute", "prepare", "deallocate",
  "set", "reset", "lock", "vacuum", "analyze", "cluster", "reindex", "refresh",
  "listen", "notify", "unlisten", "begin", "commit", "rollback", "savepoint", "discard", "into",
];

// Built-in functions that read files, sleep, or reach other servers.
const BLOCKED_FUNCTIONS = /\b(pg_sleep\w*|pg_read_\w+|pg_ls_\w+|pg_stat_file|lo_\w+|dblink\w*|pg_terminate_backend|pg_cancel_backend|set_config|current_setting|txid_\w+|pg_advisory\w*)\s*\(/i;

export function checkGeneratedSql(input: string): GuardResult {
  let sql = (input ?? "").trim();
  if (!sql) return { ok: false, reason: "The query is empty." };
  if (sql.length > MAX_SQL_LENGTH) return { ok: false, reason: "The query is too long." };

  // one trailing semicolon is fine; any other semicolon means a second statement
  sql = sql.replace(/;\s*$/, "").trim();
  if (sql.includes(";")) return { ok: false, reason: "Only one statement is allowed." };

  // comments can hide things from a human reviewer, so we don't allow them
  if (sql.includes("--") || sql.includes("/*")) return { ok: false, reason: "Comments are not allowed in generated SQL." };

  // dollar-quoted strings ($$ ... $$) are how functions get defined
  if (/\$[A-Za-z_]*\$/.test(sql)) return { ok: false, reason: "Dollar-quoted strings are not allowed." };

  if (!/^(select|with)\b/i.test(sql)) return { ok: false, reason: "The query must start with SELECT or WITH." };

  // Look at the words OUTSIDE of 'quoted strings', so a product called
  // 'Update kit' would not be blocked by mistake.
  const withoutStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
  const words = withoutStrings.toLowerCase().match(/[a-z_]+/g) ?? [];
  const bad = words.find((w) => BLOCKED_WORDS.includes(w));
  if (bad) return { ok: false, reason: `The word "${bad.toUpperCase()}" is not allowed in a read-only report.` };
  if (BLOCKED_FUNCTIONS.test(withoutStrings)) return { ok: false, reason: "That query uses a built-in function that is not allowed." };

  // only the receiving and itam tables; no system catalogs or other schemas
  if (/\b(pg_catalog|information_schema|auth|storage|extensions|vault)\s*\./i.test(withoutStrings) || /\bpg_[a-z_]+\b/i.test(withoutStrings)) {
    return { ok: false, reason: "Only the receiving and IT asset tables can be queried." };
  }

  return { ok: true, sql };
}
