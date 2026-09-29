import { Router } from "express";
import { z } from "zod";
import { AppError, asyncRoute, auth, ok, prisma, tenantId } from "../lib.js";
import { financials } from "../accounts.js";

export const accountsRouter = Router();
accountsRouter.use(auth);
accountsRouter.get("/:kind", asyncRoute(async (req, res) => {
  const tid = tenantId(req), kind = z.enum(["doctor", "lab", "radiology"]).parse(req.params.kind);
  const user = await prisma.user.findFirst({ where: { id: req.user!.id, tenantId: tid }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  if (!user) throw new AppError(403, "Accounts access required", "FORBIDDEN");
  const configured = await prisma.moduleRecord.findMany({ where: { tenantId: tid, module: "roles-permissions" } });
  const allowed = user.roles.some(({ role }) => {
    if (["SUPER_ADMIN", "CLINIC_ADMIN", "CLINIC_MANAGER", "BRANCH_ADMIN", "MANAGER"].includes(role.code)) return true;
    const custom = configured.find((r) => (r.data as any)?.code === role.code);
    const raw = custom ? (custom.data as any)?.permissions : role.permissions.map((p) => p.permission.key);
    const permissions = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",").map((p: string) => p.trim()) : [];
    return permissions.includes("accounts.read") || permissions.includes("accounts.manage");
  });
  if (!allowed) throw new AppError(403, "Accounts permission is required", "FORBIDDEN");
  const clinic = await prisma.tenant.findUniqueOrThrow({ where: { id: tid }, select: { currency: true, timezone: true } });
  if (kind === "doctor") {
    const appointments = await prisma.appointment.findMany({ where: { tenantId: tid }, include: { patient: true, doctor: true, department: true, branch: true, payments: { where: { tenantId: tid } } }, orderBy: { startsAt: "desc" } });
    return ok(res, { ...clinic, items: appointments.map((a) => ({ id: a.id, appointment: a.appointmentNumber, date: a.startsAt, patient: a.patient.name, mobile: a.patient.mobile, patientNumber: a.patient.patientNumber, service: a.doctor.name, department: a.department.name, branch: a.branch.name, status: a.status, paymentStatus: a.paymentStatus,
      methods: [...new Set(a.payments.filter((p) => ["PAID", "PARTIALLY_PAID", "REFUNDED"].includes(p.status)).map((p) => p.provider))].join(", ") || "Unrecorded",
      commissionType: a.doctor.commissionType, commissionValue: a.doctor.commissionValue,
      ...financials({ amount: a.amount, status: a.status, paymentStatus: a.paymentStatus, payments: a.payments, commissionType: a.doctor.commissionType, commissionValue: a.doctor.commissionValue }) })) });
  }
  const records = await prisma.moduleRecord.findMany({ where: { tenantId: tid, module: `${kind}-appointments` }, orderBy: { createdAt: "desc" } });
  const ids = [...new Set(records.map((r) => String((r.data as any)?.patientId || "")).filter((id) => /^[a-f0-9]{24}$/i.test(id)))];
  const patients = await prisma.patient.findMany({ where: { tenantId: tid, id: { in: ids } }, select: { id: true, name: true, mobile: true, patientNumber: true } });
  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const tests = await prisma.moduleRecord.findMany({ where: { tenantId: tid, module: `${kind}-tests` }, select: { id: true, title: true } });
  const testMap = new Map(tests.map((t) => [t.id, t.title]));
  return ok(res, { ...clinic, items: records.map((record) => {
    const d = record.data as any, patient = patientMap.get(d.patientId);
    const paymentStatus = d.paymentStatus || "PENDING";
    return { id: record.id, appointment: record.title, date: d.appointmentAt || record.createdAt, patient: patient?.name || "Unknown patient", mobile: patient?.mobile || "", patientNumber: patient?.patientNumber || "", service: d.testNames || testMap.get(d[`${kind}TestId`]) || "Unknown test", department: "", branch: "", status: record.status, paymentStatus, methods: d.paymentMethod || "Unrecorded", commissionType: "", commissionValue: 0,
      ...financials({ amount: Number(d.amount || 0), subtotal: d.subtotal == null ? undefined : Number(d.subtotal), discount: Number(d.discountAmount || 0), status: record.status, paymentStatus, payments: d.collectedAmount == null ? undefined : [{ amount: Number(d.collectedAmount), status: "PAID" }] }) };
  }) });
}));
