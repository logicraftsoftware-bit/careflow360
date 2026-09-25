import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const db = new PrismaClient();
const tenantName = "MEDICITY GUWAHATI";
const modules = ["lab-tests", "radiology-tests"];

async function main() {
  const tenants = await db.tenant.findMany({
    where: { name: { equals: tenantName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (tenants.length !== 1) throw new Error(`Expected one ${tenantName} tenant; found ${tenants.length}.`);
  const tenant = tenants[0];
  const directory = resolve(process.env.TEST_CATALOG_BACKUP_DIR || ".maintenance");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backupPath = resolve(directory, `test-catalog-reset-2026-09-25-v2-${tenant.id}.json`);
  const where = { tenantId: tenant.id, module: { in: modules } };
  // Persist the original IDs once. Re-running cannot remove replacement tests.
  let snapshot: { tenantId: string; records: { id: string }[] };
  try {
    snapshot = JSON.parse(await readFile(backupPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    snapshot = { tenantId: tenant.id, records: await db.moduleRecord.findMany({ where }) };
    await writeFile(backupPath, JSON.stringify(snapshot, null, 2), { flag: "wx", mode: 0o600 });
  }
  if (snapshot.tenantId !== tenant.id) throw new Error("Backup tenant mismatch.");
  const originalRecords = { ...where, id: { in: snapshot.records.map((record) => record.id) } };
  const result = await db.moduleRecord.deleteMany({ where: originalRecords });
  const remaining = await db.moduleRecord.count({ where: originalRecords });
  if (remaining) throw new Error(`${remaining} original test records remain.`);
  for (const module of modules) {
    console.log(`${tenant.name}: ${module} current count: ${await db.moduleRecord.count({ where: { tenantId: tenant.id, module } })}`);
  }
  console.log(`${tenant.name}: removed ${result.count} lab/radiology tests. Original tests remaining: ${remaining}. Backup: ${backupPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
