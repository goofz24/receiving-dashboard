import { describe, expect, it, vi } from "vitest";
import { askQuestion, estimateCostUsd, type Deps } from "@/lib/ask";
import { createDailyLimiter } from "@/lib/daily-limit";
import { ReadOnlyUserError } from "@/lib/run-readonly";

// These tests use a FAKE model, so they never call the real API and cost nothing.
function fakeDeps(sql: string, overrides: Partial<Deps> = {}): Deps {
  return {
    generateSql: vi.fn(async () => ({ answerable: true, sql, explanation: "fake" })),
    runSql: vi.fn(async () => ({ columns: ["x"], rows: [[1]], truncated: false })),
    ...overrides,
  };
}

describe("askQuestion", () => {
  it("runs a safe query and returns the rows with the SQL", async () => {
    const deps = fakeDeps("select count(*) as x from receipts;");
    const r = await askQuestion("How many deliveries?", deps);
    expect(r).toMatchObject({ kind: "answer", sql: "select count(*) as x from receipts", rows: [[1]] });
    expect(deps.runSql).toHaveBeenCalledWith("select count(*) as x from receipts");
  });

  it("never sends unsafe SQL to the database", async () => {
    const deps = fakeDeps("delete from receipts");
    const r = await askQuestion("delete everything", deps);
    expect(r.kind).toBe("rejected");
    expect(deps.runSql).not.toHaveBeenCalled();
  });

  it("passes through 'not answerable' without touching the database", async () => {
    const deps = fakeDeps("", {
      generateSql: vi.fn(async () => ({ answerable: false, sql: "", explanation: "Not about receiving." })),
    });
    const r = await askQuestion("What's the weather?", deps);
    expect(r).toEqual({ kind: "not_answerable", explanation: "Not about receiving." });
    expect(deps.runSql).not.toHaveBeenCalled();
  });

  it("does not call the model for empty or too-long questions", async () => {
    const deps = fakeDeps("select 1");
    expect((await askQuestion("   ", deps)).kind).toBe("error");
    expect((await askQuestion("x".repeat(301), deps)).kind).toBe("error");
    expect(deps.generateSql).not.toHaveBeenCalled();
  });

  it("shows a database error next to the SQL that caused it", async () => {
    const deps = fakeDeps("select nope from receipts", {
      runSql: vi.fn(async () => { throw new Error('column "nope" does not exist'); }),
    });
    const r = await askQuestion("q", deps);
    expect(r).toMatchObject({ kind: "rejected", sql: "select nope from receipts" });
  });

  it("re-throws a wrong-user setup error instead of hiding it", async () => {
    const deps = fakeDeps("select 1", { runSql: vi.fn(async () => { throw new ReadOnlyUserError("owner"); }) });
    await expect(askQuestion("q", deps)).rejects.toBeInstanceOf(ReadOnlyUserError);
  });
});

describe("cost guard", () => {
  it("estimates the cost of a question", () => {
    // 1,000 input tokens and 500 output tokens on Opus 5.5 = $0.004 + $0.01
    expect(estimateCostUsd("claude-opus-5-5", 1000, 500)).toBeCloseTo(0.014, 6);
    expect(estimateCostUsd("some-unknown-model", 1, 1)).toBeNull();
  });

  it("caps questions per day and resets the next day", () => {
    let now = new Date("2026-11-03T10:00:00Z");
    const limiter = createDailyLimiter(2, () => now);
    expect(limiter.tryUse()).toBe(true);
    expect(limiter.tryUse()).toBe(true);
    expect(limiter.tryUse()).toBe(false);
    now = new Date("2026-11-04T09:00:00Z");
    expect(limiter.tryUse()).toBe(true);
  });

  it("a limit of 0 turns the box off", () => {
    expect(createDailyLimiter(0).tryUse()).toBe(false);
  });
});
