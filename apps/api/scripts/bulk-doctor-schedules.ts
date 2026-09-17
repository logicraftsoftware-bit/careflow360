import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const START_DATE = "2026-09-17";
const END_DATE = "2026-12-31";
const TENANT_NAME = process.env.BULK_SCHEDULE_TENANT || "MEDICITY GUWAHATI";

const sessions = [
  { sessionPeriod: "MORNING", startTime: "09:00", endTime: "14:00", slotMinutes: 15, maxPatients: 20 },
  { sessionPeriod: "EVENING", startTime: "17:00", endTime: "19:30", slotMinutes: 15, maxPatients: 10 },
] as const;

function datesBetween(from: string, to: string) {
  const dates: Date[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const last = new Date(`${to}T00:00:00.000Z`);
  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(new Date(cursor));
  return dates;
}

async function main() {
  const tenants = await db.tenant.findMany({
    where: { name: { equals: TENANT_NAME, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (tenants.length !== 1) throw new Error(`Expected exactly one tenant named "${TENANT_NAME}", found ${tenants.length}. Set BULK_SCHEDULE_TENANT to the exact hospital name.`);

  const tenant = tenants[0];
  const [doctors, branches] = await Promise.all([
    db.doctor.findMany({ where: { tenantId: tenant.id, status: "ACTIVE" }, include: { department: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { tenantId: tenant.id, status: "ACTIVE" }, select: { id: true, name: true } }),
  ]);
  const activeBranchIds = new Set(branches.map((branch) => branch.id));
  const dates = datesBetween(START_DATE, END_DATE);
  let created = 0, updated = 0, skippedDoctors = 0;

  for (const doctor of doctors) {
    const departmentBranchIds = [...(doctor.department?.branchIds || []), ...(doctor.department?.branchId ? [doctor.department.branchId] : [])];
    const branchIds = [...new Set(departmentBranchIds)].filter((id) => activeBranchIds.has(id));
    if (!branchIds.length) {
      skippedDoctors += 1;
      console.warn(`Skipped ${doctor.name}: no active department branch assigned.`);
      continue;
    }

    for (const branchId of branchIds) {
      const existing = await db.doctorSchedule.findMany({
        where: {
          tenantId: tenant.id, doctorId: doctor.id, branchId,
          scheduleDate: { gte: new Date(`${START_DATE}T00:00:00.000Z`), lte: new Date(`${END_DATE}T00:00:00.000Z`) },
        },
      });
      const byDateAndPeriod = new Map(existing.map((item) => [
        `${item.scheduleDate?.toISOString().slice(0, 10)}:${item.sessionPeriod || "MORNING"}`,
        item,
      ]));

      for (const scheduleDate of dates) for (const session of sessions) {
        const key = `${scheduleDate.toISOString().slice(0, 10)}:${session.sessionPeriod}`;
        const current = byDateAndPeriod.get(key);
        const data = {
          tenantId: tenant.id, doctorId: doctor.id, branchId, scheduleDate,
          dayOfWeek: scheduleDate.getUTCDay(), ...session, status: "ACTIVE" as const,
        };
        if (current) {
          await db.doctorSchedule.update({ where: { id: current.id }, data });
          updated += 1;
        } else {
          await db.doctorSchedule.create({ data });
          created += 1;
        }
      }
    }
  }

  console.log(JSON.stringify({
    tenant: tenant.name, dateRange: { from: START_DATE, to: END_DATE, days: dates.length },
    activeDoctors: doctors.length, activeBranches: branches.length, created, updated, skippedDoctors,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
