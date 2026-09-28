import { z } from "zod";

const commission = z.object({
  commissionType: z.enum(["FLAT", "PERCENTAGE"]),
  commissionValue: z.preprocess(
    (value) => typeof value === "string" && value.trim() !== "" ? Number(value) : value,
    z.number().finite().nonnegative(),
  ),
}).refine((value) => value.commissionType !== "PERCENTAGE" || value.commissionValue <= 100, {
  message: "Commission percentage must be between 0 and 100",
  path: ["commissionValue"],
});

export function validateDoctorCommission(data: Record<string, unknown>, existing?: Record<string, unknown>): Partial<z.infer<typeof commission>> {
  if (existing && data.commissionType === undefined && data.commissionValue === undefined) return {};
  return commission.parse({
    commissionType: data.commissionType === undefined ? existing?.commissionType ?? "FLAT" : data.commissionType,
    commissionValue: data.commissionValue === undefined ? existing?.commissionValue ?? 0 : data.commissionValue,
  });
}
