import { describe, expect, it } from "vitest";
import { buildPoolConfig, PLACEHOLDER_PASSWORD } from "@/lib/db";

describe("buildPoolConfig", () => {
  it("requires DATABASE_URL", () => {
    expect(() => buildPoolConfig({})).toThrow(/DATABASE_URL/);
  });

  it("refuses the placeholder password from 03_security.sql", () => {
    const env = { DATABASE_URL: `postgresql://dashboard_reader:${PLACEHOLDER_PASSWORD}@localhost/db` };
    expect(() => buildPoolConfig(env)).toThrow(/placeholder/);
  });

  it("uses no SSL for localhost and encrypted SSL for a remote host", () => {
    const local = buildPoolConfig({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" });
    expect(local.ssl).toBe(false);
    const remote = buildPoolConfig({ DATABASE_URL: "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" });
    expect(remote.ssl).toEqual({ rejectUnauthorized: false });
    expect(remote.connectionString).not.toContain("sslmode");
  });

  it("verify mode needs the certificate", () => {
    const env = { DATABASE_URL: "postgresql://u:p@db.example.com/db", DATABASE_SSL: "verify" };
    expect(() => buildPoolConfig(env)).toThrow(/DATABASE_CA_CERT/);
    const ok = buildPoolConfig({ ...env, DATABASE_CA_CERT: "CERT" });
    expect(ok.ssl).toEqual({ ca: "CERT", rejectUnauthorized: true });
  });
});
