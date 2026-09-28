import { describe, expect, it } from "vitest";
import { validateDoctorCommission } from "./doctor-commission.js";

describe("doctor commission", () => {
  it("defaults older callers to zero flat commission", () => {
    expect(validateDoctorCommission({})).toEqual({ commissionType: "FLAT", commissionValue: 0 });
  });
  it("accepts flat amounts and decimal percentages", () => {
    expect(validateDoctorCommission({ commissionType: "FLAT", commissionValue: "1200.50" }).commissionValue).toBe(1200.5);
    expect(validateDoctorCommission({ commissionType: "PERCENTAGE", commissionValue: 12.5 }).commissionValue).toBe(12.5);
    expect(validateDoctorCommission({ commissionType: "PERCENTAGE", commissionValue: 100 }).commissionValue).toBe(100);
  });
  it.each([-1, 101, NaN, Infinity, "", null])("rejects invalid percentage %s", (commissionValue) => {
    expect(() => validateDoctorCommission({ commissionType: "PERCENTAGE", commissionValue })).toThrow();
  });
  it("validates partial updates against the saved type and value", () => {
    expect(() => validateDoctorCommission({ commissionType: "PERCENTAGE" }, { commissionType: "FLAT", commissionValue: 500 })).toThrow();
    expect(() => validateDoctorCommission({ commissionValue: 101 }, { commissionType: "PERCENTAGE", commissionValue: 5 })).toThrow();
    expect(validateDoctorCommission({ status: "ACTIVE" }, { commissionType: "PERCENTAGE", commissionValue: 5 })).toEqual({});
  });
  it("rejects unknown types and negative flat amounts", () => {
    expect(() => validateDoctorCommission({ commissionType: "OTHER", commissionValue: 5 })).toThrow();
    expect(() => validateDoctorCommission({ commissionType: "FLAT", commissionValue: -1 })).toThrow();
  });
});
