import { createHash, randomBytes } from "node:crypto";
import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import {
  AppError,
  asyncRoute,
  audit,
  auth,
  ok,
  prisma,
  tenantId,
  type AuthRequest,
} from "../lib.js";
import { syncClinicToErp } from "../erp-sync.js";

type ErpRequest = AuthRequest & { erpTenantId?: string };
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const appointmentInclude = {
  patient: { select: { patientNumber: true, name: true, mobile: true, email: true, gender: true, dateOfBirth: true, address: true } },
  doctor: { select: { id: true, name: true, qualification: true, registrationNumber: true } },
  department: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true, code: true, address: true, phone: true } },
} as const;

function erpAppointment(row: any) {
  return {
    appointmentId: row.id,
    appointmentNumber: row.appointmentNumber,
    appointmentDateTime: row.startsAt,
    appointmentEndDateTime: row.endsAt,
    status: row.status,
    token: row.token,
    serialNumber: row.serialNumber,
    payment: { status: row.paymentStatus, amount: row.amount, currency: "INR" },
    patient: row.patient,
    doctor: row.doctor,
    department: row.department,
    branch: row.branch,
    erp: {
      externalAppointmentId: row.erpExternalId,
      syncStatus: row.erpSyncStatus || "PENDING",
      syncMessage: row.erpSyncMessage,
      syncedAt: row.erpSyncedAt,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function erpAuth(req: ErpRequest, _res: Response, next: NextFunction) {
  try {
    const apiKey = String(req.header("x-api-key") || "").trim();
    if (!apiKey) throw new AppError(401, "X-API-Key header is required", "ERP_API_KEY_REQUIRED");
    const integration = await prisma.erpIntegration.findUnique({
      where: { apiKeyHash: hashKey(apiKey) },
      include: { tenant: { select: { status: true } } },
    });
    if (!integration || !integration.isActive)
      throw new AppError(401, "Invalid ERP API key", "INVALID_ERP_API_KEY");
    if (!["ACTIVE", "TRIAL"].includes(integration.tenant.status))
      throw new AppError(403, "Clinic account is not active", "TENANT_INACTIVE");
    req.erpTenantId = integration.tenantId;
    void prisma.erpIntegration.update({ where: { id: integration.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    next();
  } catch (error) {
    next(error);
  }
}

export const erpRouter = Router();
erpRouter.use(erpAuth);

erpRouter.get("/opd/appointments", asyncRoute(async (req: ErpRequest, res) => {
  const query = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    status: z.enum(["DRAFT", "BOOKING_PENDING", "PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"]).optional(),
    syncStatus: z.enum(["PENDING", "ACCEPTED", "REJECTED"]).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  if (query.to <= query.from || query.to.getTime() - query.from.getTime() > 31 * 86400000)
    throw new AppError(400, "Date range must be between 1 and 31 days", "INVALID_DATE_RANGE");
  const rows = await prisma.appointment.findMany({
    where: {
      tenantId: req.erpTenantId!,
      startsAt: { gte: query.from, lt: query.to },
      ...(query.status ? { status: query.status } : {}),
      ...(query.syncStatus === "PENDING" ? { OR: [{ erpSyncStatus: null }, { erpSyncStatus: "PENDING" }] } : query.syncStatus ? { erpSyncStatus: query.syncStatus } : {}),
    },
    include: appointmentInclude,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return ok(res, { items: page.map(erpAppointment), nextCursor: hasMore ? page.at(-1)!.id : null });
}));

erpRouter.get("/opd/appointments/:appointmentNumber", asyncRoute(async (req: ErpRequest, res) => {
  const row = await prisma.appointment.findFirst({
    where: { tenantId: req.erpTenantId!, appointmentNumber: req.params.appointmentNumber },
    include: appointmentInclude,
  });
  if (!row) throw new AppError(404, "Appointment not found", "NOT_FOUND");
  return ok(res, erpAppointment(row));
}));

erpRouter.post("/opd/appointments/:appointmentNumber/acknowledge", asyncRoute(async (req: ErpRequest, res) => {
  const body = z.object({
    externalAppointmentId: z.string().trim().min(1).max(200),
    syncStatus: z.enum(["ACCEPTED", "REJECTED"]),
    message: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  const found = await prisma.appointment.findFirst({ where: { tenantId: req.erpTenantId!, appointmentNumber: req.params.appointmentNumber } });
  if (!found) throw new AppError(404, "Appointment not found", "NOT_FOUND");
  if (found.erpExternalId && found.erpExternalId !== body.externalAppointmentId)
    throw new AppError(409, "Appointment is already mapped to another ERP ID", "ERP_ID_CONFLICT");
  const row = await prisma.appointment.update({
    where: { id: found.id },
    data: { erpExternalId: body.externalAppointmentId, erpSyncStatus: body.syncStatus, erpSyncMessage: body.message || null, erpSyncedAt: new Date() },
    include: appointmentInclude,
  });
  return ok(res, erpAppointment(row), "ERP acknowledgement recorded");
}));

erpRouter.patch("/opd/appointments/:appointmentNumber/status", asyncRoute(async (req: ErpRequest, res) => {
  const body = z.object({
    status: z.enum(["CHECKED_IN", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW"]),
    cancellationReason: z.string().trim().max(500).optional(),
  }).superRefine((value, context) => {
    if (value.status === "CANCELLED" && !value.cancellationReason)
      context.addIssue({ code: "custom", path: ["cancellationReason"], message: "Cancellation reason is required" });
  }).parse(req.body);
  const found = await prisma.appointment.findFirst({ where: { tenantId: req.erpTenantId!, appointmentNumber: req.params.appointmentNumber } });
  if (!found) throw new AppError(404, "Appointment not found", "NOT_FOUND");
  const row = await prisma.appointment.update({
    where: { id: found.id },
    data: { status: body.status, ...(body.status === "CANCELLED" ? { cancellationReason: body.cancellationReason } : {}) },
    include: appointmentInclude,
  });
  return ok(res, erpAppointment(row), "Appointment status updated");
}));

export const erpManagementRouter = Router();
erpManagementRouter.use(auth);
erpManagementRouter.use(asyncRoute(async (req, _res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { tenant: true, roles: { include: { role: true } } } });
  const allowed = user?.tenant?.email.toLowerCase() === user?.email.toLowerCase() || user?.roles.some(({ role }) => ["CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER"].includes(role.code));
  if (!allowed) throw new AppError(403, "Clinic administrator access required", "FORBIDDEN");
  next();
}));

erpManagementRouter.post("/api-key", asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  const apiKey = `cferp_${randomBytes(32).toString("base64url")}`;
  const integration = await prisma.erpIntegration.upsert({
    where: { tenantId: tid },
    create: { tenantId: tid, apiKeyHash: hashKey(apiKey), keyPrefix: apiKey.slice(0, 12) },
    update: { apiKeyHash: hashKey(apiKey), keyPrefix: apiKey.slice(0, 12), isActive: true },
  });
  await audit(req, "erp.api_key.rotated", "ErpIntegration", integration.id);
  return ok(res, { apiKey, keyPrefix: integration.keyPrefix }, "ERP API key created. Save it now; it will not be shown again.", 201);
}));

erpManagementRouter.get("/api-key", asyncRoute(async (req, res) => {
  const integration = await prisma.erpIntegration.findUnique({ where: { tenantId: tenantId(req) }, select: { keyPrefix: true, isActive: true, lastUsedAt: true, createdAt: true, updatedAt: true } });
  return ok(res, integration);
}));

erpManagementRouter.delete("/api-key", asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  await prisma.erpIntegration.updateMany({ where: { tenantId: tid }, data: { isActive: false } });
  await audit(req, "erp.api_key.revoked", "ErpIntegration");
  return ok(res, null, "ERP API key revoked");
}));

erpManagementRouter.get("/sync-status", asyncRoute(async (req,res)=>{
  const row=await prisma.erpOutboundIntegration.findUnique({where:{tenantId:tenantId(req)},select:{baseUrl:true,isActive:true,lastSyncStartedAt:true,lastSyncFinishedAt:true,lastSuccessAt:true,lastFailureAt:true,lastResult:true,lastHttpStatus:true,lastCounts:true,lastError:true,syncLockedAt:true}});
  return ok(res,row?{...row,configured:true,inProgress:Boolean(row.syncLockedAt)}:{configured:false,inProgress:false});
}));

erpManagementRouter.post("/sync",asyncRoute(async(req,res)=>ok(res,await syncClinicToErp(tenantId(req)),"ERP synchronization completed")));
