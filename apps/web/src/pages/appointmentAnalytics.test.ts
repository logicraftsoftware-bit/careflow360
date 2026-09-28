import { describe, expect, it } from "vitest";
import { appointmentDay, appointmentRange, appointmentTrend, summarizeAppointments } from "./appointmentAnalytics";
const row = (id: string, startsAt: string, status = "CONFIRMED", paymentStatus = "PENDING", amount = 500) => ({ id, startsAt, status, paymentStatus, amount });
describe("appointment dashboard analytics", () => {
  it("uses clinic dates at UTC day boundaries", () => {
    expect(appointmentDay("2026-09-27T20:00:00Z")).toBe("2026-09-28");
    expect(appointmentRange("Today", new Date("2026-09-27T20:00:00Z"))).toEqual(["2026-09-28", "2026-09-28"]);
  });
  it("handles previous days and leap-month boundaries", () => {
    expect(appointmentRange("Yesterday", new Date("2026-01-01T10:00:00Z"))).toEqual(["2025-12-31", "2025-12-31"]);
    expect(appointmentRange("This Month", new Date("2024-02-14T10:00:00Z"))).toEqual(["2024-02-01", "2024-02-29"]);
    expect(appointmentRange("All Time")).toEqual(["", ""]);
  });
  it("groups pending bookings and counts only paid appointment fees as revenue", () => {
    const result = summarizeAppointments([row("1", "2026-09-01", "PAYMENT_PENDING"), row("2", "2026-09-01", "BOOKING_PENDING"), row("3", "2026-09-01", "COMPLETED", "PAID", 650), row("4", "2026-09-01", "CANCELLED", "REFUNDED", 900)]);
    expect(result).toMatchObject({ total: 4, pending: 2, completed: 1, cancelled: 1, revenue: 650 });
    expect(result.bookings.reduce((n, item) => n + item.value, 0)).toBe(4);
    expect(result.payments.reduce((n, item) => n + item.value, 0)).toBe(4);
  });
  it("fills empty days and excludes out-of-range data", () => {
    const result = appointmentTrend([row("1", "2026-09-01T10:00:00Z", "COMPLETED"), row("2", "2026-09-04T10:00:00Z")], "2026-09-01", "2026-09-03", false);
    expect(result).toEqual([{ date: "2026-09-01", total: 1, completed: 1 }, { date: "2026-09-02", total: 0, completed: 0 }, { date: "2026-09-03", total: 0, completed: 0 }]);
  });
  it("supports monthly and empty ranges without fabricating appointments", () => {
    expect(appointmentTrend([row("1", "2026-09-01T10:00:00Z"), row("2", "2026-09-03T10:00:00Z")], "2026-09-01", "2026-10-02", true)).toEqual([{ date: "2026-09", total: 2, completed: 0 }, { date: "2026-10", total: 0, completed: 0 }]);
    expect(summarizeAppointments([])).toMatchObject({ total: 0, revenue: 0, bookings: [], payments: [] });
    expect(appointmentTrend([], "2026-09-30", "2026-09-01", false)).toEqual([]);
  });
});
