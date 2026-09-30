import { describe, expect, it } from "vitest";
import { scheduleEnd, validateAppointmentHours } from "./appointment-hours.js";

describe("doctor appointment hours", () => {
  it("allows sessions covering the permitted boundaries", () => {
    expect(scheduleEnd("07:00", 15, 60)).toBe("22:00");
    expect(scheduleEnd("17:00", 15, 20)).toBe("22:00");
  });
  it("rejects sessions outside the window and invalid capacity", () => {
    for (const args of [["06:59", 15, 1], ["21:46", 15, 1], ["22:00", 15, 1], ["09:00", 0, 20], ["09:00", 15, -1]] as const)
      expect(() => scheduleEnd(args[0], args[1], args[2])).toThrow();
  });
  it("checks appointment boundaries in IST", () => {
    expect(() => validateAppointmentHours(new Date("2026-09-30T01:30:00Z"), new Date("2026-09-30T16:30:00Z"))).not.toThrow();
    for (const [start, end] of [
      ["2026-09-30T01:29:00Z", "2026-09-30T01:44:00Z"],
      ["2026-09-30T16:15:00Z", "2026-09-30T16:30:01Z"],
      ["2026-09-30T16:15:00Z", "2026-10-01T01:30:00Z"],
      ["2026-09-30T01:30:00Z", "2026-09-30T01:30:00Z"],
    ]) expect(() => validateAppointmentHours(new Date(start), new Date(end))).toThrow();
  });
});
