import { describe, expect, it } from "vitest";
import { checkGeneratedSql } from "@/lib/sql-guard";

const ok = (sql: string) => expect(checkGeneratedSql(sql).ok, sql).toBe(true);
const blocked = (sql: string) => expect(checkGeneratedSql(sql).ok, sql).toBe(false);

describe("checkGeneratedSql", () => {
  it("accepts plain SELECT and WITH queries", () => {
    ok("select * from suppliers");
    ok("SELECT name FROM suppliers ORDER BY name LIMIT 5;");
    ok("with t as (select 1 as x) select x from t");
    ok("select supplier, count(*) from po_line_status where status = 'short' group by supplier");
  });

  it("allows blocked words inside quoted strings", () => {
    ok("select * from products where name = 'Update kit, drop table'");
    ok("select * from products where name ilike '%delete%'");
  });

  it("rejects anything that changes data", () => {
    blocked("delete from receipts");
    blocked("update po_lines set qty_ordered = 0");
    blocked("insert into suppliers (name) values ('x')");
    blocked("drop table suppliers");
    blocked("truncate receipts");
    blocked("with gone as (delete from receipts returning *) select * from gone");
    blocked("select * into copy_of_suppliers from suppliers");
  });

  it("rejects more than one statement (and, to be safe, any semicolon in the middle)", () => {
    blocked("select * from products where name = 'a;b'");
    blocked("select 1; select 2");
    blocked("select 1; delete from receipts");
  });

  it("rejects comments, which can hide things from a reviewer", () => {
    blocked("select 1 -- harmless?");
    blocked("select /* hi */ 1");
  });

  it("rejects settings, transactions and dangerous functions", () => {
    blocked("set role postgres");
    blocked("begin");
    blocked("select pg_sleep(10)");
    blocked("select pg_read_file('/etc/passwd')");
    blocked("select set_config('role', 'postgres', false)");
    blocked("select current_setting('server_version')");
  });

  it("rejects system catalogs and other schemas", () => {
    blocked("select * from pg_catalog.pg_roles");
    blocked("select * from pg_roles");
    blocked("select * from information_schema.tables");
    blocked("select * from auth.users");
  });

  it("rejects empty, non-SELECT and oversized input", () => {
    blocked("");
    blocked("   ");
    blocked("explain select 1");
    blocked("select " + "1,".repeat(3000) + "1");
    blocked("select $$x$$");
  });

  it("strips one trailing semicolon", () => {
    const r = checkGeneratedSql("select 1;  ");
    expect(r).toEqual({ ok: true, sql: "select 1" });
  });
});
