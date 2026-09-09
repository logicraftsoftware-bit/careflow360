import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const db = new PrismaClient();
const permissionKeys = ["dashboard.view", "leads.view", "leads.create", "leads.edit", "leads.delete", "leads.assign", "leads.convert", "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel", "appointments.confirm", "appointments.payment_manage", "appointments.generate_token", "reports.view", "reports.export", "staff.manage", "settings.manage"];
const labTests = [
  ["Complete Blood Count (CBC)", "CBC", "Hematology", "EDTA Blood", "Automated cell counter", 6, 350],
  ["Hemoglobin (Hb)", "HB", "Hematology", "EDTA Blood", "Cyanmethemoglobin", 4, 150],
  ["Erythrocyte Sedimentation Rate", "ESR", "Hematology", "Whole Blood", "Westergren", 4, 180],
  ["Blood Group & Rh Type", "BGRH", "Hematology", "EDTA Blood", "Agglutination", 4, 250],
  ["Fasting Blood Sugar", "FBS", "Biochemistry", "Fluoride Plasma", "Hexokinase", 4, 120],
  ["Postprandial Blood Sugar", "PPBS", "Biochemistry", "Fluoride Plasma", "Hexokinase", 4, 120],
  ["HbA1c", "HBA1C", "Diabetes", "EDTA Blood", "HPLC", 8, 500],
  ["Lipid Profile", "LIPID", "Biochemistry", "Serum", "Enzymatic", 8, 650],
  ["Liver Function Test", "LFT", "Biochemistry", "Serum", "Photometry", 8, 700],
  ["Kidney Function Test", "KFT", "Biochemistry", "Serum", "Photometry", 8, 650],
  ["Thyroid Profile (T3, T4, TSH)", "THYROID", "Hormones", "Serum", "CLIA", 12, 750],
  ["Urine Routine & Microscopy", "URINE-RM", "Clinical Pathology", "Urine", "Microscopy", 4, 200],
  ["Stool Routine & Microscopy", "STOOL-RM", "Clinical Pathology", "Stool", "Microscopy", 6, 250],
  ["C-Reactive Protein", "CRP", "Immunology", "Serum", "Immunoturbidimetry", 6, 450],
  ["Dengue NS1 Antigen", "DENGUE-NS1", "Serology", "Serum", "ELISA", 8, 800],
  ["Malaria Parasite Test", "MP", "Parasitology", "EDTA Blood", "Peripheral smear", 4, 300],
  ["Widal Test", "WIDAL", "Serology", "Serum", "Slide agglutination", 6, 300],
  ["Vitamin D (25-OH)", "VIT-D", "Vitamins", "Serum", "CLIA", 24, 1200],
  ["Vitamin B12", "VIT-B12", "Vitamins", "Serum", "CLIA", 24, 900],
  ["Serum Electrolytes", "ELECTROLYTES", "Biochemistry", "Serum", "Ion-selective electrode", 6, 550],
] as const;

async function seedLabTests() {
  const tenants = await db.tenant.findMany({ select: { id: true } });
  let created = 0;
  for (const tenant of tenants) {
    const existing = await db.moduleRecord.findMany({ where: { tenantId: tenant.id, module: "lab-tests" }, select: { data: true } });
    const existingCodes = new Set(existing.map((row) => String((row.data as Record<string, unknown>)?.code || "")));
    for (const [title, code, category, sampleType, method, turnaroundHours, price] of labTests) if (!existingCodes.has(code)) {
      await db.moduleRecord.create({ data: { tenantId: tenant.id, module: "lab-tests", title, status: "ACTIVE", data: { code, category, sampleType, method, turnaroundHours, price, description: `${title} laboratory test` } } });
      created += 1;
    }
  }
  return { tenants: tenants.length, created };
}

async function main() {
  for (const key of permissionKeys) await db.permission.upsert({ where: { key }, update: {}, create: { key } });
  const plans = [["Starter", "STARTER", 1499, 14990, 0], ["Professional", "PROFESSIONAL", 3499, 34990, 1], ["Enterprise", "ENTERPRISE", 7999, 79990, 2]] as const;
  for (const [name, code, monthlyPrice, annualPrice, sortOrder] of plans) await db.plan.upsert({ where: { code }, update: {}, create: { name, code, description: `${name} plan for growing clinics`, monthlyPrice, annualPrice, trialDays: 14, currency: "INR", sortOrder, popular: code === "PROFESSIONAL", limits: { create: [{ code: "max_branches", value: code === "STARTER" ? 1 : code === "PROFESSIONAL" ? 5 : 100 }, { code: "max_doctors", value: code === "STARTER" ? 5 : code === "PROFESSIONAL" ? 25 : 500 }, { code: "max_staff", value: code === "STARTER" ? 10 : code === "PROFESSIONAL" ? 50 : 1000 }] } } });
  const email = (process.env.SUPER_ADMIN_EMAIL || "hosmedai@gmail.com").replace("\\@", "@").toLowerCase(), password = process.env.SUPER_ADMIN_PASSWORD || "ChangeMe123!";
  let role = await db.role.findFirst({ where: { code: "SUPER_ADMIN" } });
  if (!role) role = await db.role.create({ data: { name: "Super Admin", code: "SUPER_ADMIN", isSystem: true } });
  for (const permission of await db.permission.findMany()) await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  let user = await db.user.findFirst({ where: { email, isPlatform: true } });
  if (!user) user = await db.user.create({ data: { name: "CareFlow360 Super Admin", email, passwordHash: await argon2.hash(password), isPlatform: true } });
  await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  const lab = await seedLabTests();
  console.log(`Seeded CareFlow360. Super admin: ${email}. Lab tests: ${lab.created} created across ${lab.tenants} tenants.`);
}

main().finally(() => db.$disconnect());
