import { describe, expect, it } from "vitest";
import type { OffboardingRow } from "@/lib/itam-data";
import { fmtDay } from "@/lib/format";
import { ageText, offboardingTicket, statusMatrix, warrantyText } from "@/lib/itam-helpers";

const leaver: OffboardingRow = {
  employeeId: 30, fullName: "Ricardo Feliciano", email: "ricardo.feliciano@example.com", department: "Customer service",
  title: "Bilingual support rep", leftOn: "2026-10-12", daysSinceLeft: 25, devices: 2,
  deviceList: "IT-LT-0034 Dell Latitude 5450; IT-MN-0016 HP E24 G5 24 in", deviceValue: 1378,
  seats: 2, seatList: "1Password Business; Microsoft 365 Business Premium", seatCostPerYear: 359.88,
};

describe("IT asset helpers", () => {
  it("warranty text reads naturally before and after the end date", () => {
    expect(warrantyText(400)).toBe("13 months of warranty left");
    expect(warrantyText(21)).toBe("Warranty ends in 21 days");
    expect(warrantyText(1)).toBe("Warranty ends in 1 day");
    expect(warrantyText(0)).toBe("Warranty ends today");
    expect(warrantyText(-5)).toBe("Out of warranty for 5 days");
    expect(warrantyText(-400)).toBe("Out of warranty for 13 months");
  });

  it("age text uses years and months", () => {
    expect(ageText(7)).toBe("7 mo");
    expect(ageText(24)).toBe("2 yr");
    expect(ageText(50)).toBe("4 yr 2 mo");
  });

  it("status matrix turns rows into one bar per type, biggest first", () => {
    const m = statusMatrix([
      { category: "phone", status: "deployed", assets: 3 },
      { category: "laptop", status: "deployed", assets: 20 },
      { category: "laptop", status: "in_stock", assets: 4 },
      { category: "phone", status: "lost", assets: 1 },
    ]);
    expect(m.map((r) => [r.category, r.total])).toEqual([["laptop", 24], ["phone", 4]]);
    expect(m[0]).toMatchObject({ deployed: 20, in_stock: 4, lost: 0 });
    expect(m[1]).toMatchObject({ deployed: 3, lost: 1 });
  });

  it("offboarding ticket lists every device and seat, with steps", () => {
    const t = offboardingTicket(leaver, fmtDay);
    expect(t).toContain("Title: Offboarding follow-up: Ricardo Feliciano (Customer service)");
    expect(t).toContain("Priority: High");
    expect(t).toContain("left on Oct 12, 25 days ago");
    expect(t).toContain("- Recover device: IT-LT-0034 Dell Latitude 5450");
    expect(t).toContain("- Recover device: IT-MN-0016 HP E24 G5 24 in");
    expect(t).toContain("- Remove license seat: Microsoft 365 Business Premium");
    expect(t).toContain("devices bought for $1,378 and seats costing $360 a year");
    expect(t).toContain("3. Remove the license seats");
  });

  it("a seats-only ticket is medium priority and skips the device steps", () => {
    const t = offboardingTicket({ ...leaver, devices: 0, deviceList: null, deviceValue: 0, seats: 1, seatList: "Adobe Acrobat Pro", seatCostPerYear: 239.88 }, fmtDay);
    expect(t).toContain("Priority: Medium");
    expect(t).not.toContain("Recover device");
    expect(t).toContain("1. Remove the license seats");
  });
});
