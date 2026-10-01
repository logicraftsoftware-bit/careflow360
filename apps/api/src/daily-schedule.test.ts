import { describe, expect, it } from "vitest";
import { DAILY_SCHEDULE, groupDailySchedules, planDailyScheduleBatch } from "./daily-schedule.js";
import { scheduleEnd } from "./appointment-hours.js";

describe("single daily doctor schedule", () => {
  it("skips converted rows when resuming a partially completed migration", () => {
    const converted = { id: "done", status: "ACTIVE", ...DAILY_SCHEDULE };
    const legacy = { ...converted, id: "legacy", sessionPeriod: "MORNING", maxPatients: 10 };
    expect(planDailyScheduleBatch([[converted], [legacy]])).toEqual({ activeIds: ["legacy"], inactiveIds: [], duplicateIds: [] });
  });
  it("preserves active duplicate status and separates inactive updates", () => {
    const first = { id: "first", status: "INACTIVE", ...DAILY_SCHEDULE };
    const duplicate = { ...first, id: "duplicate", status: "ACTIVE" };
    const inactive = { ...first, id: "inactive", sessionPeriod: "EVENING" };
    expect(planDailyScheduleBatch([[first, duplicate], [inactive]])).toEqual({ activeIds: ["first"], inactiveIds: ["inactive"], duplicateIds: ["duplicate"] });
  });
  it("removes duplicates even when the retained row already has the correct values", () => {
    const first = { id: "first", status: "ACTIVE", ...DAILY_SCHEDULE };
    expect(planDailyScheduleBatch([[first, { ...first, id: "duplicate" }]])).toEqual({ activeIds: [], inactiveIds: [], duplicateIds: ["duplicate"] });
  });
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
