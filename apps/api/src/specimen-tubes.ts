import { AppError, prisma } from "./lib.js";

export async function validateSpecimenTube(tenant: string, module: string, data: Record<string, unknown>, previousId?: unknown) {
  if (module !== "lab-tests" || data.specimenTubeId === undefined || data.specimenTubeId === "" || data.specimenTubeId === null) return;
  if (typeof data.specimenTubeId !== "string") throw new AppError(400, "Invalid specimen tube", "INVALID_SPECIMEN_TUBE");
  const tube = await prisma.moduleRecord.findFirst({ where: { id: data.specimenTubeId, tenantId: tenant, module: "specimen-tubes" } });
  if (!tube || (tube.status !== "ACTIVE" && data.specimenTubeId !== previousId)) {
    throw new AppError(400, "Select an active specimen tube from Specimen Tube Master", "INVALID_SPECIMEN_TUBE");
  }
}
