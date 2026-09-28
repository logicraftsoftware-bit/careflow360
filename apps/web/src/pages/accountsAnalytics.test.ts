import { describe, expect, it } from "vitest";
import { accountRange, financialRanking, financialTrend } from "./accountsAnalytics";
const row = (date: string, service = "Doctor A", collected: number | null = 100) => ({ date, service, status: "CONFIRMED", paymentStatus: "PAID", gross: 200, charge: 180, collected, netCollected: collected, outstanding: collected === null ? null : 80 });
describe("financial dashboard analytics", () => {
  it("uses clinic timezone and handles year boundaries", () => {
    expect(accountRange("Today", "Asia/Kolkata", new Date("2026-09-27T20:00:00Z"))).toEqual(["2026-09-28", "2026-09-28"]);
    expect(accountRange("Yesterday", "Asia/Kolkata", new Date("2026-01-01T10:00:00Z"))).toEqual(["2025-12-31", "2025-12-31"]);
  });
  it("fills zero days and excludes data outside the selected range", () => {
    expect(financialTrend([row("2026-09-01T10:00:00Z"), row("2026-09-03T10:00:00Z")], "2026-09-01", "2026-09-02", "Asia/Kolkata", false)).toEqual([{ date: "2026-09-01", gross: 200, charge: 180, collected: 100, unknown: false }, { date: "2026-09-02", gross: 0, charge: 0, collected: 0, unknown: false }]);
  });
  it("leaves incomplete collection buckets unknown instead of graphing a false zero", () => {
    expect(financialTrend([row("2026-09-01T10:00:00Z", "A", null), row("2026-09-01T11:00:00Z")], "2026-09-01", "2026-09-30", "Asia/Kolkata", true)[0]).toMatchObject({ gross: 400, charge: 360, collected: null, unknown: true });
  });
  it("ranks service totals without counting unknown payments and flags incomplete groups", () => {
    expect(financialRanking([row("2026-09-01", "A"), row("2026-09-01", "A", null), row("2026-09-01", "B")])).toEqual([{ name: "A", appointments: 2, gross: 400, collected: 100, outstanding: 80, incomplete: true }, { name: "B", appointments: 1, gross: 200, collected: 100, outstanding: 80, incomplete: false }]);
  });
  it("handles empty and invalid date ranges", () => {
    expect(financialTrend([], "", "", "Asia/Kolkata", false)).toEqual([]);
    expect(financialTrend([], "2026-09-30", "2026-09-01", "Asia/Kolkata", false)).toEqual([]);
  });
});
