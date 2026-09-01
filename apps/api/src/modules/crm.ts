import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  asyncRoute,
  audit,
  auth,
  ok,
  prisma,
  tenantId,
  AppError,
} from "../lib.js";
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
const allowedFields: Record<string, string[]> = {
  branches: [
    "name",
    "address",
    "city",
    "state",
    "country",
    "pin",
    "phone",
    "email",
    "status",
  ],
  departments: ["name", "code", "description", "status"],
  doctors: [
    "departmentId",
    "name",
    "qualification",
    "specialization",
    "registrationNumber",
    "mobile",
    "email",
    "experience",
    "consultationFee",
    "status",
  ],
  doctorSchedules: [
    "doctorId",
    "branchId",
    "dayOfWeek",
    "scheduleDate",
    "startTime",
    "endTime",
    "slotMinutes",
    "maxPatients",
    "status",
  ],
  leadSources: ["name", "code", "status"],
  leads: [
    "name",
    "mobile",
    "email",
    "city",
    "departmentId",
    "doctorId",
    "sourceId",
    "status",
    "priority",
    "remarks",
    "nextFollowUpAt",
    "assignedToId",
  ],
  patients: [
    "leadId",
    "name",
    "gender",
    "dob",
    "mobile",
    "email",
    "address",
    "city",
    "state",
    "pin",
    "status",
  ],
  appointments: [
    "patientId",
    "leadId",
    "branchId",
    "departmentId",
    "doctorId",
    "startsAt",
    "endsAt",
    "status",
    "paymentStatus",
    "amount",
    "paymentConfirmedAt",
  ],
  followups: [
    "leadId",
    "staffId",
    "scheduledAt",
    "type",
    "remarks",
    "outcome",
    "status",
    "nextFollowUpAt",
  ],
  notifications: ["userId", "type", "title", "body", "readAt"],
  supportTickets: [
    "requesterId",
    "subject",
    "description",
    "priority",
    "status",
    "assignedToId",
    "internalNotes",
  ],
};
function prepared(
  resource: string,
  body: any,
  userId: string,
  creating = false,
) {
  const allowed = allowedFields[resource] ?? [];
  const data: any = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.includes(key)),
  );
  for (const key of Object.keys(data)) {
    if (key.endsWith("Id") && data[key] === "") delete data[key];
  }
  for (const key of [
    "startsAt",
    "endsAt",
    "scheduledAt",
    "scheduleDate",
    "nextFollowUpAt",
    "dob",
  ])
    if (data[key]) data[key] = new Date(data[key]);
  for (const key of [
    "experience",
    "dayOfWeek",
    "slotMinutes",
    "maxPatients",
    "serialNumber",
  ])
    if (data[key] !== undefined && data[key] !== "")
      data[key] = Number(data[key]);
  for (const key of ["consultationFee", "amount"])
    if (data[key] !== undefined && data[key] !== "")
      data[key] = Number(data[key]);
  if (
    resource === "doctorSchedules" &&
    data.scheduleDate &&
    data.dayOfWeek === undefined
  )
    data.dayOfWeek = data.scheduleDate.getUTCDay();
  if (creating && resource === "leads") {
    data.leadNumber = `LD-${Date.now().toString(36).toUpperCase()}`;
    data.createdById = userId;
  }
  if (creating && resource === "patients")
    data.patientNumber = `PT-${Date.now().toString(36).toUpperCase()}`;
  if (creating && resource === "appointments") {
    data.appointmentNumber = `AP-${Date.now().toString(36).toUpperCase()}`;
    if (data.startsAt && !data.endsAt)
      data.endsAt = new Date(data.startsAt.getTime() + 30 * 60000);
  }
  if (creating && resource === "followups" && !data.staffId)
    data.staffId = userId;
  if (creating && resource === "supportTickets") data.requesterId = userId;
  return data;
}

function appointmentToken(
  doctorName: string,
  departmentName: string,
  departmentCode: string,
  startsAt: Date,
  serialNumber: number,
) {
  const name = doctorName.replace(/^dr\.?\s*/i, "").trim().split(/\s+/);
  const initials = `${name[0]?.[0] || "D"}${name.length > 1 ? name[name.length - 1][0] : "R"}`.toUpperCase();
  const localDate = startsAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const datePart = `${Number(localDate.slice(8, 10))}-${localDate.slice(5, 7)}`;
  const specialty = departmentName.replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase() || departmentCode.toUpperCase();
  return `${initials}-${specialty}/${datePart}/${String(serialNumber).padStart(2, "0")}`;
}
crmRouter.get(
  "/dashboard",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [
      leads,
      patients,
      appointments,
      doctors,
      branches,
      pendingFollowups,
      pipeline,
      todayFollowups,
      upcomingAppointments,
      recentPayments,
      timeline,
      todayCalls,
      todayAppointments,
    ] = await Promise.all([
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
      pipeline: Object.fromEntries(
        pipeline.map((x) => [x.status, x._count._all]),
      ),
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
  "/appointments/book",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const body = z
      .object({
        patientId: z.string(),
        branchId: z.string(),
        departmentId: z.string(),
        doctorId: z.string(),
        scheduleId: z.string(),
        status: z
          .enum(["DRAFT", "BOOKING_PENDING", "PAYMENT_PENDING", "CONFIRMED"])
          .default("CONFIRMED"),
        paymentStatus: z
          .enum(["NOT_REQUIRED", "PENDING", "PAID"])
          .default("PENDING"),
        paymentMethod: z
          .enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"])
          .optional(),
        utrNumber: z.string().trim().max(100).optional(),
        paymentRemarks: z.string().trim().max(500).optional(),
      })
      .superRefine((value, context) => {
        if (value.paymentStatus !== "PAID") return;
        if (!value.paymentMethod)
          context.addIssue({
            code: "custom",
            path: ["paymentMethod"],
            message: "Payment method is required for a paid appointment",
          });
        if (value.paymentMethod !== "CASH" && !value.utrNumber)
          context.addIssue({
            code: "custom",
            path: ["utrNumber"],
            message: "UTR or transaction number is required",
          });
      })
      .parse(req.body);
    const [patient, branch, department, doctor, schedule] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: body.patientId, tenantId: tid },
      }),
      prisma.branch.findFirst({ where: { id: body.branchId, tenantId: tid } }),
      prisma.department.findFirst({
        where: { id: body.departmentId, tenantId: tid },
      }),
      prisma.doctor.findFirst({ where: { id: body.doctorId, tenantId: tid } }),
      prisma.doctorSchedule.findFirst({
        where: {
          id: body.scheduleId,
          tenantId: tid,
          doctorId: body.doctorId,
          branchId: body.branchId,
          status: "ACTIVE",
        },
      }),
    ]);
    if (
      !patient ||
      !branch ||
      !department ||
      !doctor ||
      !schedule?.scheduleDate
    )
      throw new AppError(
        400,
        "Patient, doctor, branch, department or schedule is invalid",
        "INVALID_BOOKING",
      );
    const date = schedule.scheduleDate.toISOString().slice(0, 10),
      dayStart = new Date(`${date}T00:00:00+05:30`),
      dayEnd = new Date(dayStart.getTime() + 86400000);
    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.appointment.findFirst({
        where: {
          tenantId: tid,
          patientId: patient.id,
          doctorId: doctor.id,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: { not: "CANCELLED" },
        },
      });
      if (duplicate)
        throw new AppError(
          409,
          "This patient already has an appointment with this doctor on this date",
          "DUPLICATE_APPOINTMENT",
        );
      const booked = await tx.appointment.count({
        where: {
          tenantId: tid,
          doctorId: doctor.id,
          branchId: branch.id,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: { not: "CANCELLED" },
        },
      });
      if (booked >= schedule.maxPatients)
        throw new AppError(
          409,
          "No appointment slots remain for this date",
          "SCHEDULE_FULL",
        );
      const serialNumber = booked + 1,
        startsAt = new Date(`${date}T${schedule.startTime}:00+05:30`),
        slotStart = new Date(
          startsAt.getTime() + booked * schedule.slotMinutes * 60000,
        ),
        scheduleEnd = new Date(`${date}T${schedule.endTime}:00+05:30`);
      if (slotStart >= scheduleEnd)
        throw new AppError(
          409,
          "No appointment slots remain within the doctor's schedule",
          "SCHEDULE_FULL",
        );
      const paymentComplete = body.paymentStatus === "PAID" || body.paymentStatus === "NOT_REQUIRED";
      const token = paymentComplete
        ? appointmentToken(doctor.name, department.name, department.code, slotStart, serialNumber)
        : null;
      return tx.appointment.create({
        data: {
          tenantId: tid,
          appointmentNumber: `AP-${Date.now().toString(36).toUpperCase()}`,
          patientId: patient.id,
          branchId: branch.id,
          departmentId: department.id,
          doctorId: doctor.id,
          startsAt: slotStart,
          endsAt: new Date(slotStart.getTime() + schedule.slotMinutes * 60000),
          amount: doctor.consultationFee,
          status: body.paymentStatus === "PENDING" ? "PAYMENT_PENDING" : body.status,
          paymentStatus: body.paymentStatus,
          paymentConfirmedAt: body.paymentStatus === "PAID" ? new Date() : null,
          serialNumber,
          token,
          payments:
            body.paymentStatus === "PAID" && body.paymentMethod
              ? {
                  create: {
                    tenantId: tid,
                    provider: body.paymentMethod,
                    providerTransactionId: body.utrNumber || null,
                    remarks: body.paymentRemarks || null,
                    amount: doctor.consultationFee,
                    status: "PAID",
                    secureToken: randomUUID(),
                    confirmedAt: new Date(),
                  },
                }
              : undefined,
        },
      });
    });
    await audit(req, "appointment.booked", "Appointment", result.id, {
      token: result.token,
      serialNumber: result.serialNumber,
    });
    return ok(
      res,
      result,
      result.paymentStatus === "PENDING"
        ? "Appointment slot held pending payment"
        : "Appointment booked successfully",
      201,
    );
  }),
);
crmRouter.post(
  "/bulk/:resource",
  asyncRoute(async (req, res) => {
    const resource = req.params.resource;
    if (!["leads", "patients"].includes(resource))
      throw new AppError(
        404,
        "Bulk import is not available for this resource",
        "NOT_FOUND",
      );
    const records = z
      .array(z.record(z.string(), z.any()))
      .min(1)
      .max(500)
      .parse(req.body.records);
    const tid = tenantId(req),
      stamp = Date.now().toString(36).toUpperCase();
    const created = await prisma.$transaction(async (tx) => {
      const model = resource === "leads" ? tx.lead : tx.patient;
      const output = [];
      for (let index = 0; index < records.length; index += 1) {
        const data = {
          ...prepared(resource, records[index], req.user!.id, true),
          tenantId: tid,
        } as any;
        if (resource === "leads")
          data.leadNumber = `LD-${stamp}-${String(index + 1).padStart(3, "0")}`;
        else
          data.patientNumber = `PT-${stamp}-${String(index + 1).padStart(3, "0")}`;
        output.push(await (model as any).create({ data }));
      }
      return output;
    });
    await audit(req, `${resource}.bulk_imported`, resource, undefined, {
      count: created.length,
    });
    return ok(res, { count: created.length }, "Bulk import completed", 201);
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
    await audit(
      req,
      `${req.params.resource}.created`,
      req.params.resource,
      row.id,
    );
    return ok(res, row, "Created successfully", 201);
  }),
);
crmRouter.patch(
  "/leads/:id/status",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const { status } = z
      .object({
        status: z.enum([
          "NEW",
          "CONTACTED",
          "INTERESTED",
          "FOLLOW_UP_REQUIRED",
          "APPOINTMENT_PENDING",
          "CONVERTED",
          "NOT_INTERESTED",
          "CALLBACK_LATER",
          "INVALID",
          "LOST",
        ]),
      })
      .parse(req.body);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: tid },
    });
    if (!lead) throw new AppError(404, "Lead not found", "NOT_FOUND");
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data: { status },
      });
      let patient = await tx.patient.findUnique({ where: { leadId: lead.id } });
      if (status === "CONVERTED" && !patient) {
        patient = await tx.patient.create({
          data: {
            tenantId: tid,
            leadId: lead.id,
            patientNumber: `PT-${Date.now().toString(36).toUpperCase()}`,
            name: lead.name,
            mobile: lead.mobile,
            email: lead.email,
            city: lead.city,
          },
        });
      }
      return { lead: updated, patient };
    });
    await audit(req, `lead.status.${status.toLowerCase()}`, "Lead", lead.id, {
      status,
      patientId: result.patient?.id,
    });
    return ok(
      res,
      result,
      status === "CONVERTED"
        ? "Lead converted and patient created"
        : "Lead status updated",
    );
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
    if (req.params.resource === "appointments" && data.startsAt) {
      const appointment = found as any,
        patientId = data.patientId || appointment.patientId,
        doctorId = data.doctorId || appointment.doctorId,
        date = data.startsAt.toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        }),
        dayStart = new Date(`${date}T00:00:00+05:30`),
        dayEnd = new Date(dayStart.getTime() + 86400000),
        duplicate = await prisma.appointment.findFirst({
          where: {
            tenantId: tid,
            id: { not: appointment.id },
            patientId,
            doctorId,
            startsAt: { gte: dayStart, lt: dayEnd },
            status: { not: "CANCELLED" },
          },
        });
      if (duplicate)
        throw new AppError(
          409,
          "This patient already has an appointment with this doctor on this date",
          "DUPLICATE_APPOINTMENT",
        );
    }
    if (req.params.resource === "appointments") {
      const appointment = found as any;
      if (data.paymentStatus === "PENDING") {
        data.status = "PAYMENT_PENDING";
        data.token = null;
        data.paymentConfirmedAt = null;
      } else if (["PAID", "NOT_REQUIRED"].includes(data.paymentStatus)) {
        const [doctor, department] = await Promise.all([
          prisma.doctor.findFirst({
            where: { id: data.doctorId || appointment.doctorId, tenantId: tid },
          }),
          prisma.department.findFirst({
            where: {
              id: data.departmentId || appointment.departmentId,
              tenantId: tid,
            },
          }),
        ]);
        if (!doctor || !department)
          throw new AppError(400, "Doctor or department is invalid", "INVALID_APPOINTMENT");
        if (!appointment.token)
          data.token = appointmentToken(
            doctor.name,
            department.name,
            department.code,
            data.startsAt || appointment.startsAt,
            appointment.serialNumber || 1,
          );
        data.status = "CONFIRMED";
        if (data.paymentStatus === "PAID") {
          data.paymentConfirmedAt = new Date();
          if (appointment.paymentStatus !== "PAID") {
            const paymentMethod = z
              .enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"])
              .parse(req.body.paymentMethod);
            const utrNumber = z.string().trim().max(100).optional().parse(req.body.utrNumber);
            if (paymentMethod !== "CASH" && !utrNumber)
              throw new AppError(
                400,
                "UTR or transaction number is required",
                "PAYMENT_REFERENCE_REQUIRED",
              );
            data.payments = {
              create: {
                tenantId: tid,
                provider: paymentMethod,
                providerTransactionId: utrNumber || null,
                remarks: z.string().trim().max(500).optional().parse(req.body.paymentRemarks) || null,
                amount: Number(data.amount ?? appointment.amount),
                status: "PAID",
                secureToken: randomUUID(),
                confirmedAt: new Date(),
              },
            };
          }
        }
      }
    }
    const row = await model.update({ where: { id: found.id }, data });
    await audit(
      req,
      `${req.params.resource}.updated`,
      req.params.resource,
      row.id,
    );
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
    await audit(
      req,
      `${req.params.resource}.deleted`,
      req.params.resource,
      found.id,
    );
    return ok(res, null, "Deleted successfully");
  }),
);
