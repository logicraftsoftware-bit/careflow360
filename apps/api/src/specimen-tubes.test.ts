import { beforeEach, describe, expect, it, vi } from "vitest";
const findFirst = vi.hoisted(() => vi.fn());
vi.mock("./lib.js", () => ({ prisma: { moduleRecord: { findFirst } }, AppError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { validateSpecimenTube } from "./specimen-tubes.js";
beforeEach(() => vi.resetAllMocks());
describe("lab test specimen tube links", () => {
  it("accepts an active tube within the current tenant", async () => {
    findFirst.mockResolvedValue({ status: "ACTIVE" });
    await validateSpecimenTube("tenant-a", "lab-tests", { specimenTubeId: "tube-1" });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "tube-1", tenantId: "tenant-a", module: "specimen-tubes" } });
  });
  it("rejects missing tubes including those outside the tenant", async () => {
    findFirst.mockResolvedValue(null);
    await expect(validateSpecimenTube("tenant-a", "lab-tests", { specimenTubeId: "foreign-tube" })).rejects.toMatchObject({ status: 400 });
  });
  it("rejects a newly selected inactive tube but preserves an existing link", async () => {
    findFirst.mockResolvedValue({ status: "INACTIVE" });
    await expect(validateSpecimenTube("tenant-a", "lab-tests", { specimenTubeId: "tube-1" })).rejects.toMatchObject({ status: 400 });
    await expect(validateSpecimenTube("tenant-a", "lab-tests", { specimenTubeId: "tube-1" }, "tube-1")).resolves.toBeUndefined();
  });
  it("allows legacy tests and clearing an optional link", async () => {
    for (const specimenTubeId of [undefined, null, ""]) await validateSpecimenTube("tenant-a", "lab-tests", { specimenTubeId });
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs and leaves other modules alone", async () => {
    await expect(validateSpecimenTube("tenant-a", "lab-tests", { specimenTubeId: {} })).rejects.toMatchObject({ status: 400 });
    await validateSpecimenTube("tenant-a", "radiology-tests", { specimenTubeId: "tube-1" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
