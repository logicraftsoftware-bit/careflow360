import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DAILY_SCHEDULE, groupDailySchedules } from "../src/daily-schedule.js";

const db = new PrismaClient();
async function main() {
  const rows = await db.doctorSchedule.findMany({ orderBy: { id: "asc" } });
  const groups = groupDailySchedules(rows);
  let removed = 0;
  for (const [first, ...duplicates] of groups) {
    await db.$transaction(async (tx) => {
      await tx.doctorSchedule.update({ where: { id: first.id }, data: {
        ...DAILY_SCHEDULE,
        status: [first, ...duplicates].some((row) => row.status === "ACTIVE") ? "ACTIVE" : "INACTIVE",
      } });
      if (duplicates.length) await tx.doctorSchedule.deleteMany({ where: { id: { in: duplicates.map((row) => row.id) } } });
    });
    removed += duplicates.length;
  }
  console.log(JSON.stringify({ dailySchedules: groups.length, duplicateSessionsRemoved: removed }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
