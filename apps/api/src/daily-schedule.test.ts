import { describe, expect, it } from "vitest";
import { DAILY_SCHEDULE, groupDailySchedules } from "./daily-schedule.js";
import { scheduleEnd } from "./appointment-hours.js";

describe("single daily doctor schedule", () => {
  it("has exactly 30 half-hour slots ending at 10 PM", () => {
    expect(DAILY_SCHEDULE.maxPatients).toBe(30);
    expect(scheduleEnd(DAILY_SCHEDULE.startTime, DAILY_SCHEDULE.slotMinutes, DAILY_SCHEDULE.maxPatients)).toBe("22:00");
    expect(7 * 60 + 29 * DAILY_SCHEDULE.slotMinutes).toBe(21 * 60 + 30);
  });
  it("consolidates sessions only within the same tenant, doctor, branch and date", () => {
    const row = { tenantId: "t", doctorId: "d", branchId: "b", scheduleDate: new Date("2026-09-30"), dayOfWeek: 3 };
    const groups = groupDailySchedules([
      { ...row, sessionPeriod: "MORNING" }, { ...row, sessionPeriod: "EVENING" },
      { ...row, tenantId: "other", sessionPeriod: "DAILY" },
      { ...row, doctorId: "other", sessionPeriod: "DAILY" },
      { ...row, branchId: "other", sessionPeriod: "DAILY" },
      { ...row, scheduleDate: new Date("2026-10-01"), sessionPeriod: "DAILY" },
    ]);
    expect(groups.map((group) => group.length)).toEqual([2, 1, 1, 1, 1]);
    expect(groupDailySchedules(groups.map(([first]) => first))).toHaveLength(5);
  });
});
