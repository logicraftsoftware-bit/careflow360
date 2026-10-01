import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DAILY_SCHEDULE, groupDailySchedules, planDailyScheduleBatch } from "../src/daily-schedule.js";

const db = new PrismaClient();
async function main() {
  console.log("Loading doctor schedules for daily-session migration...");
  const rows = await db.doctorSchedule.findMany({ orderBy: { id: "asc" } });
  const groups = groupDailySchedules(rows);
  console.log(`Checking ${rows.length} schedules in ${groups.length} daily groups`);
  let removed = 0, updated = 0;
  for (let offset = 0; offset < groups.length; offset += 100) {
    const { activeIds, inactiveIds, duplicateIds } = planDailyScheduleBatch(groups.slice(offset, offset + 100));
    // Keep each batch atomic, so an interrupted deployment can safely resume.
    const operations = [];
    if (activeIds.length) operations.push(db.doctorSchedule.updateMany({ where: { id: { in: activeIds } }, data: { ...DAILY_SCHEDULE, status: "ACTIVE" } }));
    if (inactiveIds.length) operations.push(db.doctorSchedule.updateMany({ where: { id: { in: inactiveIds } }, data: { ...DAILY_SCHEDULE, status: "INACTIVE" } }));
    if (duplicateIds.length) operations.push(db.doctorSchedule.deleteMany({ where: { id: { in: duplicateIds } } }));
    if (operations.length) await db.$transaction(operations);
    removed += duplicateIds.length;
    updated += activeIds.length + inactiveIds.length;
    console.log(`Checked ${Math.min(offset + 100, groups.length)}/${groups.length} daily groups; updated ${updated}; removed ${removed} duplicates`);
  }
  console.log(JSON.stringify({ dailySchedules: groups.length, updated, duplicateSessionsRemoved: removed }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
