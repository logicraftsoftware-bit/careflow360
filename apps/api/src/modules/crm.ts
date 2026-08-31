import { Router } from "express";
import { z } from "zod";
import { asyncRoute, audit, auth, ok, prisma, tenantId, AppError } from "../lib.js";
export const crmRouter = Router();
crmRouter.use(auth);
const resources: any = {
  branches: prisma.branch,
  departments: prisma.department,
  doctors: prisma.doctor,
  doctorSchedules: prisma.doctorSchedule,
  leadSources: prisma.leadSource,
  leads: prisma.lead,
  patients: prisma.patient,
  appointments: prisma.appointment,
  followups: prisma.followUp,
  auditLogs: prisma.auditLog,
  notifications: prisma.notification,
  supportTickets: prisma.supportTicket,
};
function prepared(resource: string, body: any, userId: string, creating = false) {
  const data = { ...body };
  delete data.id;
  delete data.tenantId;
  for (const key of Object.keys(data)) {
    if (key.endsWith("Id") && data[key] === "") delete data[key];
  }
  for (const key of ["startsAt", "endsAt", "scheduledAt", "nextFollowUpAt", "dob"]) if (data[key]) data[key] = new Date(data[key]);
  for (const key of ["experience", "dayOfWeek", "slotMinutes", "maxPatients", "serialNumber"]) if (data[key] !== undefined && data[key] !== "") data[key] = Number(data[key]);
  for (const key of ["consultationFee", "amount"]) if (data[key] !== undefined && data[key] !== "") data[key] = Number(data[key]);
  if (creating && resource === "leads") {
    data.leadNumber = `LD-${Date.now().toString(36).toUpperCase()}`;
    data.createdById = userId;
  }
  if (creating && resource === "patients") data.patientNumber = `PT-${Date.now().toString(36).toUpperCase()}`;
  if (creating && resource === "appointments") {
    data.appointmentNumber = `AP-${Date.now().toString(36).toUpperCase()}`;
    if (data.startsAt && !data.endsAt) data.endsAt = new Date(data.startsAt.getTime() + 30 * 60000);
  }
  if (creating && resource === "followups" && !data.staffId) data.staffId = userId;
  return data;
}
crmRouter.get(
  "/dashboard",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [leads, patients, appointments, doctors, branches, pendingFollowups, pipeline, todayFollowups, upcomingAppointments, recentPayments, timeline, todayCalls, todayAppointments] = await Promise.all([
      prisma.lead.count({ where: { tenantId: tid } }),
      prisma.patient.count({ where: { tenantId: tid } }),
      prisma.appointment.count({ where: { tenantId: tid } }),
      prisma.doctor.count({ where: { tenantId: tid } }),
      prisma.branch.count({ where: { tenantId: tid } }),
      prisma.followUp.count({ where: { tenantId: tid, status: "PENDING" } }),
      prisma.lead.groupBy({
        by: ["status"],
        where: { tenantId: tid },
        _count: { _all: true },
      }),
      prisma.followUp.findMany({
        where: {
          tenantId: tid,
          status: "PENDING",
          scheduledAt: { gte: start, lt: end },
        },
        include: { lead: true },
        orderBy: { scheduledAt: "asc" },
        take: 6,
      }),
      prisma.appointment.findMany({
        where: { tenantId: tid, startsAt: { gte: new Date() } },
        include: { patient: true, doctor: true, department: true },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      prisma.payment.findMany({
        where: { tenantId: tid },
        include: { appointment: { include: { patient: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.auditLog.findMany({
        where: { tenantId: tid },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.followUp.count({
        where: {
          tenantId: tid,
          type: "CALL",
          scheduledAt: { gte: start, lt: end },
        },
      }),
      prisma.appointment.count({
        where: { tenantId: tid, startsAt: { gte: start, lt: end } },
      }),
    ]);
    return ok(res, {
      leads,
      patients,
      appointments,
      doctors,
      branches,
      pendingFollowups,
      todayCalls,
      todayAppointments,
      pipeline: Object.fromEntries(pipeline.map((x) => [x.status, x._count._all])),
      todayFollowups,
      upcomingAppointments,
      recentPayments,
      timeline,
    });
  }),
);
crmRouter.get(
  "/modules/:module",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const items = await prisma.moduleRecord.findMany({
      where: { tenantId: tid, module: req.params.module },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, { items, total: items.length, page: 1, limit: 100 });
  }),
);
crmRouter.post(
  "/modules/:module",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const { title, status = "ACTIVE", ...data } = req.body;
    const row = await prisma.moduleRecord.create({
      data: {
        tenantId: tid,
        module: req.params.module,
        title: title || data.name || "Untitled record",
        status,
        data,
      },
    });
    await audit(req, `${req.params.module}.created`, "ModuleRecord", row.id);
    return ok(res, row, "Created successfully", 201);
  }),
);
crmRouter.patch(
  "/modules/:module/:id",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const found = await prisma.moduleRecord.findFirst({
      where: { id: req.params.id, tenantId: tid, module: req.params.module },
    });
    if (!found) throw new AppError(404, "Record not found", "NOT_FOUND");
    const { title, status, ...data } = req.body;
    const row = await prisma.moduleRecord.update({
      where: { id: found.id },
      data: {
        title: title || found.title,
        status: status || found.status,
        data: { ...(found.data as object), ...data },
      },
    });
    await audit(req, `${req.params.module}.updated`, "ModuleRecord", row.id);
    return ok(res, row, "Updated successfully");
  }),
);
crmRouter.delete(
  "/modules/:module/:id",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const found = await prisma.moduleRecord.findFirst({
      where: { id: req.params.id, tenantId: tid, module: req.params.module },
    });
    if (!found) throw new AppError(404, "Record not found", "NOT_FOUND");
    await prisma.moduleRecord.delete({ where: { id: found.id } });
    await audit(req, `${req.params.module}.deleted`, "ModuleRecord", found.id);
    return ok(res, null, "Deleted successfully");
  }),
);
crmRouter.get(
  "/:resource",
  asyncRoute(async (req, res) => {
    const model = resources[req.params.resource];
    if (!model) throw new AppError(404, "Resource not found", "NOT_FOUND");
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = Math.min(100, Number(req.query.limit) || 25);
    const tid = tenantId(req);
    const where: any = { tenantId: tid };
    if (typeof req.query.status === "string") where.status = req.query.status;
    const [items, total] = await Promise.all([
      model.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      model.count({ where }),
    ]);
    return ok(res, { items, total, page, limit });
  }),
);
crmRouter.post(
  "/:resource",
  asyncRoute(async (req, res) => {
    const model = resources[req.params.resource];
    if (!model) throw new AppError(404, "Resource not found", "NOT_FOUND");
    const tid = tenantId(req);
    const data = {
      ...prepared(req.params.resource, req.body, req.user!.id, true),
      tenantId: tid,
    };
    const row = await model.create({ data });
    await audit(req, `${req.params.resource}.created`, req.params.resource, row.id);
    return ok(res, row, "Created successfully", 201);
  }),
);
crmRouter.patch(
  "/:resource/:id",
  asyncRoute(async (req, res) => {
    const model = resources[req.params.resource];
    if (!model) throw new AppError(404, "Resource not found", "NOT_FOUND");
    const tid = tenantId(req);
    const found = await model.findFirst({
      where: { id: req.params.id, tenantId: tid },
    });
    if (!found) throw new AppError(404, "Record not found", "NOT_FOUND");
    const data = prepared(req.params.resource, req.body, req.user!.id);
    const row = await model.update({ where: { id: found.id }, data });
    await audit(req, `${req.params.resource}.updated`, req.params.resource, row.id);
    return ok(res, row, "Updated successfully");
  }),
);
crmRouter.delete(
  "/:resource/:id",
  asyncRoute(async (req, res) => {
    const model = resources[req.params.resource];
    if (!model) throw new AppError(404, "Resource not found", "NOT_FOUND");
    const tid = tenantId(req);
    const found = await model.findFirst({
      where: { id: req.params.id, tenantId: tid },
    });
    if (!found) throw new AppError(404, "Record not found", "NOT_FOUND");
    await model.delete({ where: { id: found.id } });
    await audit(req, `${req.params.resource}.deleted`, req.params.resource, found.id);
    return ok(res, null, "Deleted successfully");
  }),
);
