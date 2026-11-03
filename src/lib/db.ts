import { Pool, types, type PoolConfig } from "pg";

// Return DATE columns as plain "YYYY-MM-DD" text instead of a JavaScript
// Date, so time zones can never move a delivery to the wrong day.
types.setTypeParser(1082, (value) => value);

// The placeholder password from sql/03_security.sql. If it is still in
// the connection string, someone forgot to change it, so we stop.
export const PLACEHOLDER_PASSWORD = "REPLACE_WITH_A_LONG_RANDOM_PASSWORD";

export function buildPoolConfig(env: Record<string, string | undefined> = process.env): PoolConfig {
  const raw = env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const url = new URL(raw);
  if (decodeURIComponent(url.password) === PLACEHOLDER_PASSWORD) {
    throw new Error("DATABASE_URL still uses the placeholder password from 03_security.sql. Set a real one.");
  }
  // We control SSL with DATABASE_SSL below, so drop sslmode from the URL
  // to stop the two settings from fighting.
  url.searchParams.delete("sslmode");

  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const mode = env.DATABASE_SSL ?? (local ? "off" : "require");
  let ssl: PoolConfig["ssl"];
  if (mode === "off") ssl = false;
  else if (mode === "verify") {
    // Full check of the server's certificate. Needs the CA file
    // (Supabase: Database settings > SSL configuration > Download certificate).
    if (!env.DATABASE_CA_CERT) throw new Error("DATABASE_SSL=verify needs DATABASE_CA_CERT (the certificate text).");
    ssl = { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true };
  } else if (mode === "require") {
    // Encrypted, but the certificate is not checked. Fine for a demo with
    // made-up data; use "verify" for anything real.
    ssl = { rejectUnauthorized: false };
  } else {
    throw new Error(`DATABASE_SSL must be off, require or verify (got "${mode}").`);
  }

  return { connectionString: url.toString(), ssl, max: 5, idleTimeoutMillis: 10_000 };
}

// One shared pool for the whole app (kept on globalThis so Next.js hot
// reload in development does not open a new pool on every save).
const globalForPool = globalThis as unknown as { receivingPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.receivingPool) {
    globalForPool.receivingPool = new Pool(buildPoolConfig());
  }
  return globalForPool.receivingPool;
}
