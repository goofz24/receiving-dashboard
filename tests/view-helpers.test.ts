import { describe, expect, it } from "vitest";
import type { WeekRow } from "@/lib/data";
import { fmtDay } from "@/lib/format";
import { followUpEmail, greeting, initials, niceScale, toCsv, trendPct, weeklyTotals } from "@/lib/view-helpers";

describe("view helpers", () => {
  it("greets by time of day", () => {
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(13)).toBe("Good afternoon");
    expect(greeting(20)).toBe("Good evening");
  });

  it("trend is a whole percent, and null with nothing to compare", () => {
    expect(trendPct(392, 239)).toBe(64);
    expect(trendPct(11, 12)).toBe(-8);
    expect(trendPct(5, 0)).toBeNull();
  });

  it("chart ticks are round numbers that reach the top bar", () => {
    expect(niceScale(453)).toEqual({ top: 600, ticks: [0, 200, 400, 600] });
    expect(niceScale(0).top).toBeGreaterThan(0);
    const { top } = niceScale(137);
    expect(top).toBeGreaterThanOrEqual(137);
  });

  it("weekly totals add suppliers together, or keep one, and keep empty weeks", () => {
    const rows: WeekRow[] = [
      { weekStart: "2026-10-19", supplierId: 1, deliveries: 1, unitsReceived: 10 },
      { weekStart: "2026-10-19", supplierId: 2, deliveries: 2, unitsReceived: 5 },
      { weekStart: "2026-10-26", supplierId: 1, deliveries: 0, unitsReceived: 0 },
      { weekStart: "2026-10-26", supplierId: 2, deliveries: 1, unitsReceived: 7 },
    ];
    expect(weeklyTotals(rows, 12, null)).toEqual([
      { weekStart: "2026-10-19", units: 15, deliveries: 3 },
      { weekStart: "2026-10-26", units: 7, deliveries: 1 },
    ]);
    expect(weeklyTotals(rows, 12, 1).map((w) => w.units)).toEqual([10, 0]);
    expect(weeklyTotals(rows, 1, null)).toHaveLength(1);
  });

  it("follow-up emails say what went wrong, with the numbers", () => {
    const line = { poNumber: "PO-5053", supplier: "Ceiba Office Supply", sku: "OFF-1032", product: "Ballpoint pens, 60", qtyOrdered: 28, qtyReceived: 22, qtyDamaged: 0, receivedOn: "2026-11-01" };
    const short = followUpEmail(line, "short", fmtDay);
    expect(short).toContain("Subject: PO-5053 follow-up");
    expect(short).toContain("Hi Ceiba Office Supply team");
    expect(short).toContain("counted 22, so we're 6 short");
    expect(short).toContain("(delivered Nov 1)");
    expect(followUpEmail({ ...line, qtyReceived: 30 }, "over", fmtDay)).toContain("send the extra 2 back");
    expect(followUpEmail({ ...line, qtyDamaged: 3 }, "damaged", fmtDay)).toContain("3 × Ballpoint pens, 60 (OFF-1032) arrived damaged");
    expect(followUpEmail({ ...line, receivedOn: null, expectedOn: "2026-09-27" }, "overdue", fmtDay)).toContain("It was due Sep 27");
  });

  it("CSV quotes values with commas", () => {
    expect(toCsv(["a", "b"], [["Pens, 60", 3]])).toBe('a,b\n"Pens, 60",3');
  });

  it("initials", () => {
    expect(initials("M. Rivera")).toBe("MR");
    expect(initials("Ceiba Office Supply")).toBe("CO");
  });
});
