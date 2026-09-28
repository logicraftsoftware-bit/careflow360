import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

type SourceRow = { id: string; name: string; department: string; price: number };
const sourcePath = fileURLToPath(new URL("./data/test-list-2026-09-25.json", import.meta.url));
const source = JSON.parse(await readFile(sourcePath, "utf8")) as { source: string; sha256: string; rows: SourceRow[] };
const importKey = `test-list:${source.sha256}`;
const modalityByDepartment: Record<string, string> = {
  "X-RAY": "X-RAY", "BARIUM X-RAY": "X-RAY", "Radiology - X RAY": "X-RAY",
  "SPECIAL X-RAY": "X-RAY", "Ultrasonography": "ULTRASOUND", "CT -Scan": "CT", "DOPPLER": "DOPPLER",
};
const departmentName = (row: SourceRow) => row.department.trim() || "No Department";
const moduleName = (row: SourceRow) => modalityByDepartment[departmentName(row)] ? "radiology-tests" : "lab-tests";
const title = (row: SourceRow) => row.name || `Unnamed test — ${row.id}`;
const normalize = (value: string) => value.trim().toLowerCase();
const seen = new Set<string>();
for (const row of source.rows) {
  if (!row.id || seen.has(row.id) || typeof row.name !== "string" || typeof row.department !== "string" || !Number.isFinite(row.price) || row.price < 0) {
    throw new Error(`Invalid or duplicate source row: ${row.id}`);
  }
  seen.add(row.id);
}
if (source.rows.length !== 3403) throw new Error("Expected all 3,403 source rows.");
const originalPath = process.env.TEST_LIST_ORIGINAL;
if (originalPath) {
  const original = await readFile(originalPath);
  if (createHash("sha256").update(original).digest("hex") !== source.sha256) throw new Error("Original file checksum mismatch.");
  const parsed = [...original.toString("utf8").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((match) => {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1].replace(/<[^>]*>/g, "").trim());
    if (!cells.length) return [];
    if (cells.length !== 4) throw new Error("Unexpected source table columns.");
    return [{ id: cells[0], name: cells[1], department: cells[2], price: Number(cells[3]) }];
  });
  if (JSON.stringify(parsed) !== JSON.stringify(source.rows)) throw new Error("Prepared data does not exactly match original rows.");
}
const summary = {
  rows: source.rows.length,
  unnamed: source.rows.filter((row) => !row.name).length,
  departments: Object.fromEntries([...new Set(source.rows.map(departmentName))].map((name) => [name, source.rows.filter((row) => departmentName(row) === name).length])),
  modules: Object.fromEntries(["lab-tests", "radiology-tests"].map((module) => [module, source.rows.filter((row) => moduleName(row) === module).length])),
};
console.log(JSON.stringify(summary, null, 2));
if (!process.argv.includes("--apply")) {
  console.log("Validated. Run with --apply and DATABASE_URL configured to import.");
} else {
  const db = new PrismaClient();
  try {
    const tenantName = process.env.TEST_IMPORT_TENANT || "MEDICITY GUWAHATI";
    const tenants = await db.tenant.findMany({ where: { name: { equals: tenantName, mode: "insensitive" } }, select: { id: true, name: true } });
    if (tenants.length !== 1) throw new Error(`Expected one tenant named ${tenantName}; found ${tenants.length}.`);
    const tenant = tenants[0];
    const modules = ["lab-tests", "radiology-tests", "lab-categories", "radiology-categories"];
    const [departments, records] = await Promise.all([
      db.department.findMany({ where: { tenantId: tenant.id } }),
      db.moduleRecord.findMany({ where: { tenantId: tenant.id, module: { in: modules } } }),
    ]);
    const directory = resolve(process.env.TEST_IMPORT_BACKUP_DIR || ".maintenance");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, `before-test-import-${tenant.id}-${Date.now()}.json`), JSON.stringify({ tenant, departments, records }, null, 2), { flag: "wx", mode: 0o600 });
    // One transaction keeps departments, categories, tests and audit consistent.
    const result = await db.$transaction(async (tx) => {
      let createdDepartments = 0, createdCategories = 0;
      const departmentIds = new Map<string, string>();
      const codes = new Set(departments.map((item) => item.code));
      for (const name of Object.keys(summary.departments)) {
        const matches = departments.filter((item) => normalize(item.name) === normalize(name));
        if (matches.length > 1) throw new Error(`Ambiguous department: ${name}`);
        let department = matches[0];
        if (!department) {
          const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
          let code = base;
          for (let i = 2; codes.has(code); i++) code = `${base}_${i}`;
          codes.add(code);
          department = await tx.department.create({ data: { tenantId: tenant.id, name, code, status: "ACTIVE" } });
          createdDepartments++;
        }
        departmentIds.set(name, department.id);
      }
      for (const module of ["lab-tests", "radiology-tests"]) {
        for (const name of new Set(source.rows.filter((row) => moduleName(row) === module).map(departmentName))) {
          const categoryModule = module.replace("-tests", "-categories");
          if (records.some((item) => item.module === categoryModule && item.title === name)) continue;
          await tx.moduleRecord.create({ data: { tenantId: tenant.id, module: categoryModule, title: name, data: { code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), departmentId: departmentIds.get(name)! } } });
          createdCategories++;
        }
      }
      const imported = records.filter((item) => (item.data as Prisma.JsonObject).importKey === importKey);
      const existingIds = new Set(imported.map((item) => String((item.data as Prisma.JsonObject).sourceId)));
      if (existingIds.size !== imported.length) throw new Error("Duplicate existing source IDs; refusing import.");
      const pending = source.rows.filter((row) => !existingIds.has(row.id));
      for (let offset = 0; offset < pending.length; offset += 250) {
        await tx.moduleRecord.createMany({ data: pending.slice(offset, offset + 250).map((row) => ({
          tenantId: tenant.id, module: moduleName(row), title: title(row), status: "ACTIVE",
          data: { code: `TEST-${row.id}`, category: departmentName(row), department: departmentName(row), departmentId: departmentIds.get(departmentName(row))!, price: row.price,
            ...(modalityByDepartment[departmentName(row)] ? { modality: modalityByDepartment[departmentName(row)] } : {}),
            importKey, sourceFile: source.source, sourceId: row.id, sourceName: row.name, sourceDepartment: row.department, needsNameReview: !row.name },
        })) });
      }
      const actual = await tx.moduleRecord.findMany({ where: { tenantId: tenant.id, module: { in: ["lab-tests", "radiology-tests"] } } });
      const importedRows = actual.filter((item) => (item.data as Prisma.JsonObject).importKey === importKey);
      if (importedRows.length !== source.rows.length) throw new Error("Imported row count mismatch.");
      for (const row of source.rows) {
        const matches = importedRows.filter((item) => (item.data as Prisma.JsonObject).sourceId === row.id);
        const record = matches[0], data = record?.data as Prisma.JsonObject | undefined;
        if (matches.length !== 1 || record.title !== title(row) || record.module !== moduleName(row) || data?.price !== row.price || data?.category !== departmentName(row) || data?.departmentId !== departmentIds.get(departmentName(row)) || data?.sourceName !== row.name || data?.sourceDepartment !== row.department) throw new Error(`Verification failed for source ID ${row.id}`);
      }
      const outcome = { tenant: tenant.name, createdDepartments, createdCategories, createdTests: pending.length, alreadyImported: imported.length, verified: importedRows.length, ...summary };
      await tx.auditLog.create({ data: { tenantId: tenant.id, action: "test-catalog.imported", entityType: "ModuleRecord", metadata: { importKey, ...outcome } } });
      return outcome;
    }, { maxWait: 10000, timeout: 180000 });
    const reportPath = resolve(directory, `test-import-report-${tenant.id}.json`);
    await writeFile(reportPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    console.log(`Verified import report: ${reportPath}`);
  } finally {
    await db.$disconnect();
  }
}
