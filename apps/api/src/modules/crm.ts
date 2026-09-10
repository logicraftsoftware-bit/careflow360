import { Router } from "express";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import bwipjs from "bwip-js";
import {
  asyncRoute,
  audit,
  auth,
  ok,
  prisma,
  tenantId,
  AppError,
} from "../lib.js";
import {
  type AppointmentMessage,
  appointmentToken,
  sendCancelledMessage,
  sendPaymentPendingMessage,
  sendPaymentSuccessMessage,
  sendRescheduledMessage,
  sendDiagnosticMessage,
} from "../aisensy.js";
import {
  ensureDiagnosticPaymentLink,
  ensureRazorpayPaymentLink,
} from "../razorpay.js";
export const crmRouter = Router();
crmRouter.use(auth);
const tubeBarcodeValue = (token: string) =>
  `CF${token.replaceAll("-", "").slice(0, 20).toUpperCase()}`;
const defaultSpecimenTubes = [
  ["SST_GOLD", "SST Gold-Top Tube", "Serum", "Gold", "Clot activator and gel", "5 mL"],
  ["PLAIN_RED", "Plain Red-Top Tube", "Serum", "Red", "None / clot activator", "5 mL"],
  ["EDTA_LAVENDER", "EDTA Lavender-Top Tube", "Whole blood", "Lavender", "K2/K3 EDTA", "3 mL"],
  ["EDTA_PINK", "EDTA Pink-Top Tube", "Whole blood", "Pink", "K2 EDTA", "6 mL"],
  ["CITRATE_BLUE", "Sodium Citrate Blue-Top Tube", "Citrated plasma", "Light blue", "3.2% sodium citrate", "2.7 mL"],
  ["FLUORIDE_GREY", "Fluoride Grey-Top Tube", "Plasma", "Grey", "Sodium fluoride/potassium oxalate", "2 mL"],
  ["HEPARIN_GREEN", "Heparin Green-Top Tube", "Heparin plasma", "Green", "Sodium/lithium heparin", "4 mL"],
  ["HEPARIN_MINT", "Lithium Heparin Mint-Top PST", "Plasma", "Mint green", "Lithium heparin and gel", "4.5 mL"],
  ["ACD_YELLOW", "ACD Yellow-Top Tube", "Whole blood", "Yellow", "Acid citrate dextrose", "8.5 mL"],
  ["SPS_YELLOW", "SPS Yellow-Top Blood Culture Tube", "Whole blood", "Yellow", "Sodium polyanethol sulfonate", "8.3 mL"],
  ["ESR_BLACK", "ESR Black-Top Tube", "Whole blood", "Black", "Sodium citrate", "2.4 mL"],
  ["TRACE_ROYAL_BLUE", "Trace Element Royal Blue-Top Tube", "Serum/plasma", "Royal blue", "Trace-element controlled", "6 mL"],
  ["TAN_LEAD", "Lead Tan-Top Tube", "Whole blood", "Tan", "K2 EDTA", "6 mL"],
  ["ORANGE_RST", "Rapid Serum Orange-Top Tube", "Serum", "Orange", "Thrombin clot activator", "5 mL"],
  ["WHITE_PPT", "PPT Pearl White-Top Tube", "Plasma", "Pearl white", "K2 EDTA and gel", "5 mL"],
  ["URINE_STERILE", "Sterile Urine Container", "Urine", "White", "Sterile, no additive", "100 mL"],
  ["URINE_BORIC", "Boric Acid Urine Tube", "Urine", "Yellow", "Boric acid preservative", "10 mL"],
  ["STOOL_CONTAINER", "Sterile Stool Container", "Stool", "White", "Sterile, no additive", "30 mL"],
  ["SWAB_VTM", "Viral Transport Medium Tube", "Nasopharyngeal/oropharyngeal swab", "Red", "Viral transport medium", "3 mL"],
  ["SWAB_AMIES", "Amies Transport Swab", "Swab", "Blue", "Amies transport medium", "1 unit"],
] as const;
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
    "cancellationReason",
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
  creating = false
) {
  const allowed = allowedFields[resource] ?? [];
  const data: any = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.includes(key))
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

async function notifyAppointment(
  req: Parameters<typeof audit>[0],
  kind: "payment_pending" | "payment_success" | "cancelled" | "rescheduled",
  appointment: AppointmentMessage,
  details?: { cancellationReason?: string; previousStartsAt?: Date }
) {
  try {
    const delivery =
      kind === "payment_pending"
        ? await sendPaymentPendingMessage(appointment)
        : kind === "payment_success"
        ? await sendPaymentSuccessMessage(appointment)
        : kind === "cancelled"
        ? await sendCancelledMessage(
            appointment,
            details?.cancellationReason || "Cancelled by clinic"
          )
        : await sendRescheduledMessage(
            appointment,
            details?.previousStartsAt || appointment.startsAt
          );
    await audit(
      req,
      `appointment.whatsapp.${kind}.${delivery.sent ? "sent" : "skipped"}`,
      "Appointment",
      appointment.appointmentId,
      delivery
    );
  } catch (error) {
    await audit(
      req,
      `appointment.whatsapp.${kind}.failed`,
      "Appointment",
      appointment.appointmentId,
      {
        error: error instanceof Error ? error.message : "Unknown AiSensy error",
      }
    );
  }
}
async function notifyDiagnostic(
  req: Parameters<typeof audit>[0],
  row: any,
  previous?: any,
  strict = false
) {
  const data = row.data as any;
  if (
    !["lab-appointments", "radiology-appointments"].includes(row.module) ||
    !data?.patientId
  )
    return;
  if (
    previous &&
    previous.appointmentAt === data.appointmentAt &&
    previous.paymentStatus === data.paymentStatus &&
    previous.status === row.status
  )
    return;
  const [patient, clinic] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: data.patientId, tenantId: row.tenantId },
    }),
    prisma.tenant.findUnique({ where: { id: row.tenantId } }),
  ]);
  if (!patient || !clinic) return;
  const message: AppointmentMessage = {
    appointmentId: row.id,
    tenantId: row.tenantId,
    appointmentNumber: row.title,
    patientName: patient.name,
    patientMobile: patient.mobile,
    patientNumber: patient.patientNumber,
    clinicName: clinic.name,
    clinicPhone: clinic.mobile,
    doctorName: row.module === "lab-appointments" ? "Laboratory" : "Radiology",
    departmentName: data.testNames || "Diagnostic test",
    branchName: "Clinic",
    startsAt: new Date(data.appointmentAt || row.createdAt),
    amount: Number(data.amount || 0),
    token: row.title,
  };
  const kind =
    row.status === "CANCELLED"
      ? "cancelled"
      : previous?.appointmentAt && previous.appointmentAt !== data.appointmentAt
      ? "rescheduled"
      : data.paymentStatus === "PAID"
      ? "payment_success"
      : "payment_pending";
  try {
    const paymentLink =
      kind === "payment_pending"
        ? await ensureDiagnosticPaymentLink(row, patient)
        : null;
    const delivery = await sendDiagnosticMessage(kind, message, {
      previousStartsAt: previous?.appointmentAt
        ? new Date(previous.appointmentAt)
        : undefined,
      cancellationReason: data.cancellationReason,
      paymentUrl: paymentLink?.short_url,
    });
    await audit(
      req,
      `${row.module}.whatsapp.${kind}.${delivery.sent ? "sent" : "skipped"}`,
      "ModuleRecord",
      row.id,
      delivery
    );
    if (strict && !delivery.sent)
      throw new Error(delivery.reason || "AiSensy did not send the message");
  } catch (error) {
    await audit(
      req,
      `${row.module}.whatsapp.${kind}.failed`,
      "ModuleRecord",
      row.id,
      {
        error: error instanceof Error ? error.message : "Unknown AiSensy error",
      }
    );
    if (strict)
      throw new AppError(
        502,
        error instanceof Error ? error.message : "WhatsApp message failed",
        "AISENSY_SEND_FAILED"
      );
  }
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
        pipeline.map((x) => [x.status, x._count._all])
      ),
      todayFollowups,
      upcomingAppointments,
      recentPayments,
      timeline,
    });
  })
);
crmRouter.get(
  "/staff-accounts",
  asyncRoute(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { tenantId: tenantId(req), isPlatform: false },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, {
      items: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        status: user.status,
        role: user.roles[0]?.role.code || "STAFF",
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })),
      total: users.length,
    });
  })
);
crmRouter.post(
  "/staff-accounts",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      body = z
        .object({
          name: z.string().trim().min(2),
          email: z.string().email(),
          mobile: z.string().trim().optional(),
          password: z.string().min(8),
          role: z.string().trim().min(2),
          status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
        })
        .parse(req.body);
    const roleRecords = await prisma.moduleRecord.findMany({
        where: { tenantId: tid, module: "roles-permissions" },
      }),
      roleRecord = roleRecords.find(
        (item) => (item.data as any)?.code === body.role
      );
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tid, code: body.role } },
      update: { name: roleRecord?.title || body.role.replaceAll("_", " ") },
      create: {
        tenantId: tid,
        code: body.role,
        name: roleRecord?.title || body.role.replaceAll("_", " "),
      },
    });
    const permissions = Array.isArray((roleRecord?.data as any)?.permissions)
      ? ((roleRecord!.data as any).permissions as string[])
      : [];
    for (const key of permissions) {
      const permission = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    const user = await prisma.user.create({
      data: {
        tenantId: tid,
        name: body.name,
        email: body.email.toLowerCase(),
        mobile: body.mobile || null,
        passwordHash: await argon2.hash(body.password),
        status: body.status,
        roles: { create: { roleId: role.id } },
      },
    });
    await audit(req, "staff.created", "Staff", user.id, {
      name: user.name,
      email: user.email,
      role: body.role,
    });
    return ok(res, { id: user.id }, "Staff account created", 201);
  })
);
crmRouter.patch(
  "/staff-accounts/:id",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      body = z
        .object({
          name: z.string().trim().min(2),
          email: z.string().email(),
          mobile: z.string().trim().optional(),
          password: z.string().min(8).optional().or(z.literal("")),
          role: z.string().trim().min(2),
          status: z.enum(["ACTIVE", "INACTIVE"]),
        })
        .parse(req.body);
    const found = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: tid, isPlatform: false },
    });
    if (!found) throw new AppError(404, "Staff account not found", "NOT_FOUND");
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tid, code: body.role } },
      update: {},
      create: {
        tenantId: tid,
        code: body.role,
        name: body.role.replaceAll("_", " "),
      },
    });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: found.id },
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          mobile: body.mobile || null,
          status: body.status,
          ...(body.password
            ? { passwordHash: await argon2.hash(body.password) }
            : {}),
        },
      }),
      prisma.userRole.deleteMany({ where: { userId: found.id } }),
      prisma.userRole.create({ data: { userId: found.id, roleId: role.id } }),
    ]);
    await audit(
      req,
      body.password ? "staff.password_reset" : "staff.updated",
      "Staff",
      found.id,
      { role: body.role }
    );
    return ok(res, { id: found.id }, "Staff account updated");
  })
);
crmRouter.get(
  "/staff-accounts/:id/activity",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: tid },
    });
    if (!user) throw new AppError(404, "Staff account not found", "NOT_FOUND");
    const items = await prisma.auditLog.findMany({
      where: { tenantId: tid, actorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, { user: { id: user.id, name: user.name }, items });
  })
);
crmRouter.delete(
  "/staff-accounts/:id",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    if (req.params.id === req.user!.id)
      throw new AppError(
        400,
        "You cannot delete your own account",
        "SELF_DELETE"
      );
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: tid, isPlatform: false },
    });
    if (!user) throw new AppError(404, "Staff account not found", "NOT_FOUND");
    await prisma.user.delete({ where: { id: user.id } });
    await audit(req, "staff.deleted", "Staff", user.id, { name: user.name });
    return ok(res, null, "Staff account deleted");
  })
);
crmRouter.get(
  "/lab-technicians",
  asyncRoute(async (req, res) => {
    const users = await prisma.user.findMany({
      where: {
        tenantId: tenantId(req),
        status: "ACTIVE",
        roles: { some: { role: { code: "LAB_TECHNICIAN" } } },
      },
      select: { id: true, name: true, email: true, mobile: true },
    });
    return ok(res, users);
  })
);
crmRouter.patch(
  "/lab-appointments/:id/assign",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      body = z.object({ technicianId: z.string() }).parse(req.body),
      [record, technician] = await Promise.all([
        prisma.moduleRecord.findFirst({
          where: {
            id: req.params.id,
            tenantId: tid,
            module: "lab-appointments",
          },
        }),
        prisma.user.findFirst({
          where: {
            id: body.technicianId,
            tenantId: tid,
            status: "ACTIVE",
            roles: { some: { role: { code: "LAB_TECHNICIAN" } } },
          },
        }),
      ]);
    if (!record)
      throw new AppError(404, "Lab appointment not found", "NOT_FOUND");
    if (!technician)
      throw new AppError(
        400,
        "Please select an active Lab Technician",
        "INVALID_TECHNICIAN"
      );
    const row = await prisma.moduleRecord.update({
      where: { id: record.id },
      data: {
        status: "ASSIGNED",
        data: {
          ...(record.data as object),
          assignedTechnicianId: technician.id,
          assignedTechnicianName: technician.name,
          assignedAt: new Date().toISOString(),
          assignedById: req.user!.id,
        },
      },
    });
    await audit(req, "lab.appointment.assigned", "ModuleRecord", row.id, {
      technicianId: technician.id,
      technicianName: technician.name,
    });
    return ok(res, row, `Assigned to ${technician.name}`);
  })
);
const collectionStages = [
  "ASSIGNED",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "PATIENT_VERIFIED",
  "PREPARATION_CHECKED",
  "BARCODES_SCANNED",
  "SPECIMENS_COLLECTED",
  "PAYMENT_RECORDED",
  "PACKAGED",
  "SAMPLE_COLLECTED",
  "IN_TRANSIT",
  "RECEIVED",
] as const;
crmRouter.post(
  "/lab-collections/orders",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      body = z
        .object({
          patientId: z.string(),
          appointmentAt: z.coerce.date(),
          testNames: z.string().trim().min(2),
          instructions: z.string().trim().max(500).optional(),
          priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
          paymentStatus: z.enum(["PENDING", "PAID", "PARTIALLY_PAID"]).default("PENDING"),
          subtotal: z.coerce.number().min(0).optional(),
          discountAmount: z.coerce.number().min(0).default(0),
          amount: z.coerce.number().min(0).default(0),
          technicianId: z.string().optional(),
          specimens: z
            .array(
              z.object({
                tubeType: z.string().trim().min(2),
                sampleType: z.string().trim().min(2),
                tests: z.array(z.string().trim().min(1)).min(1),
              })
            )
            .min(1),
        })
        .parse(req.body),
      patient = await prisma.patient.findFirst({
        where: { id: body.patientId, tenantId: tid },
      });
    if (body.specimens.some((item) => item.tests.length !== 1))
      throw new AppError(400, "Choose exactly one specimen tube for each test", "ONE_TUBE_PER_TEST_REQUIRED");
    if (!patient) throw new AppError(404, "Patient not found", "NOT_FOUND");
    const roles = await prisma.userRole.findMany({
        where: { userId: req.user!.id },
        select: { role: { select: { code: true } } },
      }),
      isAdmin =
        req.user!.isPlatform ||
        roles.some(({ role }) =>
          ["SUPER_ADMIN", "CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER"].includes(
            role.code
          )
        ),
      technicianId = isAdmin ? body.technicianId : req.user!.id;
    if (!technicianId)
      throw new AppError(
        400,
        "Please assign a lab technician",
        "TECHNICIAN_REQUIRED"
      );
    const technician = await prisma.user.findFirst({
      where: {
        id: technicianId,
        tenantId: tid,
        status: "ACTIVE",
        roles: { some: { role: { code: "LAB_TECHNICIAN" } } },
      },
      select: { id: true, name: true },
    });
    if (!technician)
      throw new AppError(
        400,
        "Please select an active lab technician",
        "INVALID_TECHNICIAN"
      );
    const now = new Date().toISOString(),
      specimens = body.specimens.map((specimen, index) => {
        const qrToken = randomUUID();
        return {
          ...specimen,
          id: `SP-${randomUUID()}`,
          sequence: index + 1,
          status: "EXPECTED",
          qrToken,
          barcodeValue: tubeBarcodeValue(qrToken),
        };
      }),
      row = await prisma.moduleRecord.create({
        data: {
          tenantId: tid,
          module: "lab-appointments",
          title: `LAB-${Date.now().toString(36).toUpperCase()}`,
          status: "ASSIGNED",
          data: {
            patientId: patient.id,
            testNames: body.testNames,
            appointmentAt: body.appointmentAt.toISOString(),
            instructions: body.instructions || "",
            priority: body.priority,
            paymentStatus: body.paymentStatus,
            subtotal: body.subtotal ?? body.amount,
            discountAmount: body.discountAmount,
            amount: body.amount,
            assignedTechnicianId: technician.id,
            assignedTechnicianName: technician.name,
            assignedAt: now,
            createdByTechnicianId: isAdmin ? undefined : req.user!.id,
            createdById: req.user!.id,
            specimens,
            workflow: [{ stage: "ASSIGNED", at: now, by: req.user!.id }],
          },
        },
      });
    await audit(req, "lab.order.technician_created", "ModuleRecord", row.id, {
      specimenCount: specimens.length,
    });
    return ok(res, row, "Lab order created and assigned", 201);
  })
);
crmRouter.patch(
  "/lab-collections/orders/:id",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      body = z.object({
        patientId: z.string(),
        appointmentAt: z.coerce.date(),
        technicianId: z.string(),
        testNames: z.string().trim().min(2),
        instructions: z.string().trim().max(500).optional(),
        priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
        paymentStatus: z.enum(["PENDING", "PAID", "PARTIALLY_PAID"]).default("PENDING"),
        subtotal: z.coerce.number().min(0).optional(),
        discountAmount: z.coerce.number().min(0).default(0),
        amount: z.coerce.number().min(0).default(0),
        specimens: z.array(z.object({ tubeType: z.string().trim().min(2), sampleType: z.string().trim().min(2), tests: z.array(z.string().trim().min(1)).min(1) })).min(1),
      }).parse(req.body),
      roles = await prisma.userRole.findMany({ where: { userId: req.user!.id }, select: { role: { select: { code: true } } } }),
      isAdmin = req.user!.isPlatform || roles.some(({ role }) => ["SUPER_ADMIN", "CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER"].includes(role.code));
    if (!isAdmin) throw new AppError(403, "Only an administrator can edit lab orders", "ADMIN_REQUIRED");
    const [record, patient, technician] = await Promise.all([
      prisma.moduleRecord.findFirst({ where: { id: req.params.id, tenantId: tid, module: "lab-appointments" } }),
      prisma.patient.findFirst({ where: { id: body.patientId, tenantId: tid } }),
      prisma.user.findFirst({ where: { id: body.technicianId, tenantId: tid, status: "ACTIVE", roles: { some: { role: { code: "LAB_TECHNICIAN" } } } }, select: { id: true, name: true } }),
    ]);
    if (!record) throw new AppError(404, "Lab order not found", "NOT_FOUND");
    if (!patient) throw new AppError(404, "Patient not found", "NOT_FOUND");
    if (!technician) throw new AppError(400, "Please select an active lab technician", "INVALID_TECHNICIAN");
    if (record.status !== "ASSIGNED") throw new AppError(409, "An order can only be edited before the technician accepts it", "ORDER_IN_PROGRESS");
    if (body.specimens.some((item) => item.tests.length !== 1))
      throw new AppError(400, "Choose exactly one specimen tube for each test", "ONE_TUBE_PER_TEST_REQUIRED");
    const previous = record.data as any,
      specimens = body.specimens.map((item, index) => {
        const existing = previous.specimens?.find((specimen: any) => specimen.tests?.[0] === item.tests[0]);
        const qrToken = existing?.qrToken || randomUUID();
        return { ...item, id: existing?.id || `SP-${randomUUID()}`, sequence: index + 1, status: "EXPECTED", qrToken, barcodeValue: existing?.barcodeValue || tubeBarcodeValue(qrToken) };
      }),
      definitionChanged = JSON.stringify((previous.specimens || []).map(({ tubeType, sampleType, tests }: any) => ({ tubeType, sampleType, tests }))) !== JSON.stringify(body.specimens),
      row = await prisma.moduleRecord.update({
        where: { id: record.id },
        data: { data: { ...previous, patientId: patient.id, appointmentAt: body.appointmentAt.toISOString(), assignedTechnicianId: technician.id, assignedTechnicianName: technician.name, testNames: body.testNames, instructions: body.instructions || "", priority: body.priority, paymentStatus: body.paymentStatus, subtotal: body.subtotal ?? body.amount, discountAmount: body.discountAmount, amount: body.amount, specimens, ...(definitionChanged ? { labelsGeneratedAt: null, labelsGeneratedById: null } : {}) } },
      });
    await audit(req, "lab.order.updated", "ModuleRecord", row.id, { specimenCount: specimens.length, labelsInvalidated: definitionChanged });
    return ok(res, row, "Lab order updated successfully");
  })
);
crmRouter.get(
  "/lab-collections/:id/labels",
  asyncRoute(async (req, res) => {
    const roles = await prisma.userRole.findMany({
      where: { userId: req.user!.id },
      select: { role: { select: { code: true } } },
    });
    const isAdmin =
      req.user!.isPlatform ||
      roles.some(({ role }) =>
        ["SUPER_ADMIN", "CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER"].includes(
          role.code
        )
      );
    const record = await prisma.moduleRecord.findFirst({
      where: {
        id: req.params.id,
        tenantId: tenantId(req),
        module: "lab-appointments",
      },
    });
    if (!record) throw new AppError(404, "Lab order not found", "NOT_FOUND");
    const data = record.data as any;
    const ownOnSpotOrder =
      data.createdByTechnicianId === req.user!.id &&
      data.assignedTechnicianId === req.user!.id;
    if (!isAdmin && !ownOnSpotOrder)
      throw new AppError(
        403,
        "Only an administrator or the technician who created this on-the-spot order can generate tube labels",
        "LABEL_ACCESS_DENIED"
      );
    if (!(data.specimens || []).length)
      throw new AppError(
        409,
        "This order has no specimen tubes. Edit or recreate it with specimen details.",
        "SPECIMENS_REQUIRED"
      );
    const
      specimens = await Promise.all(
        (data.specimens || []).map(async (specimen: any) => {
          const barcodeValue = specimen.barcodeValue || tubeBarcodeValue(specimen.qrToken);
          const png = await bwipjs.toBuffer({
            bcid: "code128",
            text: barcodeValue,
            scale: 3,
            height: 12,
            includetext: true,
            textxalign: "center",
          });
          return { ...specimen, barcodeValue, barcodeDataUrl: `data:image/png;base64,${png.toString("base64")}` };
        })
      );
    const generatedAt = new Date().toISOString();
    await prisma.moduleRecord.update({
      where: { id: record.id },
      data: {
        data: {
          ...data,
          specimens: specimens.map(({ barcodeDataUrl: _barcodeDataUrl, ...specimen }: any) => specimen),
          labelsGeneratedAt: generatedAt,
          labelsGeneratedById: req.user!.id,
        },
      },
    });
    await audit(req, "lab.labels.generated", "ModuleRecord", record.id, {
      specimenCount: specimens.length,
    });
    return ok(res, {
      orderId: record.id,
      orderNumber: record.title,
      patientId: data.patientId,
      generatedAt,
      specimens,
    });
  })
);
crmRouter.patch(
  "/lab-collections/:id/workflow",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      body = z
        .object({
          stage: z.enum([
            ...collectionStages,
            "ACCEPTED_AT_LAB",
            "REJECTED_AT_LAB",
          ] as [string, ...string[]]),
          notes: z.string().trim().max(500).optional(),
          barcodeTokens: z.array(z.string()).optional(),
          checklist: z.record(z.boolean()).optional(),
          payment: z
            .object({
              status: z.enum(["PAID", "PENDING", "NOT_REQUIRED"]),
              method: z.string().optional(),
              amount: z.coerce.number().min(0).optional(),
              transactionId: z.string().optional(),
            })
            .optional(),
        })
        .parse(req.body),
      record = await prisma.moduleRecord.findFirst({
        where: { id: req.params.id, tenantId: tid, module: "lab-appointments" },
      });
    if (!record) throw new AppError(404, "Lab order not found", "NOT_FOUND");
    const data = record.data as any,
      roles = await prisma.userRole.findMany({
        where: { userId: req.user!.id },
        include: { role: true },
      }),
      isAdmin =
        req.user!.isPlatform ||
        roles.some((x) =>
          ["SUPER_ADMIN", "CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER"].includes(
            x.role.code
          )
        );
    if (!data.labelsGeneratedAt)
      throw new AppError(
        409,
        "Administrator must generate and print tube labels before collection starts",
        "LABELS_NOT_GENERATED"
      );
    if (!isAdmin && data.assignedTechnicianId !== req.user!.id)
      throw new AppError(
        403,
        "This order is assigned to another technician",
        "FORBIDDEN"
      );
    if (
      body.stage === "BARCODES_SCANNED" &&
      data.assignedTechnicianId !== req.user!.id
    )
      throw new AppError(
        403,
        "Only the assigned lab technician can scan these tube labels",
        "ASSIGNED_TECHNICIAN_REQUIRED"
      );
    if (
      ["ACCEPTED_AT_LAB", "REJECTED_AT_LAB"].includes(body.stage) &&
      !isAdmin
    )
      throw new AppError(
        403,
        "Only an administrator can accept or reject samples at the lab",
        "ADMIN_REQUIRED"
      );
    const current = String(record.status),
      currentIndex = collectionStages.indexOf(current as any),
      nextIndex = collectionStages.indexOf(body.stage as any);
    if (body.stage === "ACCEPTED_AT_LAB" || body.stage === "REJECTED_AT_LAB") {
      if (current !== "RECEIVED")
        throw new AppError(
          409,
          "Order must be received before lab review",
          "INVALID_TRANSITION"
        );
    } else if (nextIndex !== currentIndex + 1)
      throw new AppError(
        409,
        `Expected next stage: ${
          collectionStages[currentIndex + 1] || "lab review"
        }`,
        "INVALID_TRANSITION"
      );
    if (body.stage === "BARCODES_SCANNED") {
      const expected = (data.specimens || []).map((x: any) => x.qrToken).sort(),
        scanned = [...(body.barcodeTokens || [])].sort();
      if (JSON.stringify(expected) !== JSON.stringify(scanned))
        throw new AppError(
          400,
          "Every expected specimen barcode must be scanned",
          "BARCODE_MISMATCH"
        );
    }
    const at = new Date().toISOString(),
      updated = await prisma.moduleRecord.update({
        where: { id: record.id },
        data: {
          status: body.stage,
          data: {
            ...data,
            ...(body.payment
              ? {
                  paymentStatus: body.payment.status,
                  paymentMethod: body.payment.method,
                  amount: body.payment.amount ?? data.amount,
                  transactionId: body.payment.transactionId,
                  paymentCollectedById: req.user!.id,
                }
              : {}),
            workflow: [
              ...(data.workflow || []),
              {
                stage: body.stage,
                at,
                by: req.user!.id,
                notes: body.notes,
                checklist: body.checklist,
              },
            ],
          },
        },
      });
    await audit(
      req,
      `lab.workflow.${body.stage.toLowerCase()}`,
      "ModuleRecord",
      record.id,
      { notes: body.notes }
    );
    return ok(
      res,
      updated,
      `Order moved to ${body.stage.replaceAll("_", " ")}`
    );
  })
);
crmRouter.get(
  "/lab-collections",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      state = z
        .enum(["assigned", "collected", "all"])
        .default("assigned")
        .parse(req.query.state),
      roles = await prisma.userRole.findMany({
        where: { userId: req.user!.id },
        include: { role: true },
      }),
      isTechnician = roles.some((item) => item.role.code === "LAB_TECHNICIAN"),
      rows = await prisma.moduleRecord.findMany({
        where: {
          tenantId: tid,
          module: "lab-appointments",
          ...(state === "all"
            ? {}
            : state === "collected"
            ? {
                status: {
                  in: [
                    "SAMPLE_COLLECTED",
                    "IN_TRANSIT",
                    "RECEIVED",
                    "ACCEPTED_AT_LAB",
                    "REJECTED_AT_LAB",
                  ],
                },
              }
            : {
                status: {
                  in: [
                    "ASSIGNED",
                    "ACCEPTED",
                    "ON_THE_WAY",
                    "ARRIVED",
                    "PATIENT_VERIFIED",
                    "PREPARATION_CHECKED",
                    "BARCODES_SCANNED",
                    "SPECIMENS_COLLECTED",
                    "PAYMENT_RECORDED",
                    "PACKAGED",
                  ],
                },
              }),
        },
        orderBy: { updatedAt: "desc" },
      }),
      visible = isTechnician
        ? rows.filter(
            (row) => (row.data as any)?.assignedTechnicianId === req.user!.id
          )
        : rows,
      patientIds = [
        ...new Set(
          visible.map((row) => (row.data as any)?.patientId).filter(Boolean)
        ),
      ],
      patients = await prisma.patient.findMany({
        where: { tenantId: tid, id: { in: patientIds } },
      }),
      patientMap = new Map(patients.map((patient) => [patient.id, patient]));
    return ok(res, {
      items: visible.map((row) => ({
        ...row,
        ...(row.data as object),
        patient: patientMap.get((row.data as any)?.patientId),
      })),
      total: visible.length,
    });
  })
);
crmRouter.patch(
  "/lab-collections/:id/collect",
  asyncRoute(async (req, res) => {
    throw new AppError(
      409,
      "Direct collection is disabled. Complete every collection workflow step and scan all tube labels.",
      "WORKFLOW_REQUIRED"
    );
  })
);
crmRouter.get(
  "/payment-logs",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const roles = await prisma.userRole.findMany({
      where: { userId: req.user!.id },
      select: { role: { select: { code: true } } },
    });
    const adminCodes = [
      "SUPER_ADMIN",
      "CLINIC_ADMIN",
      "BRANCH_ADMIN",
      "MANAGER",
    ];
    const isAdmin =
      req.user!.isPlatform ||
      roles.some(({ role }) => adminCodes.includes(role.code));
    const [doctorAppointments, diagnosticAppointments] = await Promise.all([
      prisma.appointment.findMany({
        where: { tenantId: tid },
        include: {
          patient: {
            select: { id: true, name: true, mobile: true, patientNumber: true },
          },
          doctor: { select: { id: true, name: true } },
          payments: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.moduleRecord.findMany({
        where: {
          tenantId: tid,
          module: { in: ["lab-appointments", "radiology-appointments"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const diagnosticData = diagnosticAppointments.map((row) => ({
      row,
      data: row.data as Record<string, any>,
    }));
    const patientIds = [
      ...new Set(
        diagnosticData.map(({ data }) => data.patientId).filter(Boolean)
      ),
    ];
    const testIds = [
      ...new Set(
        diagnosticData
          .flatMap(({ data }) => [data.labTestId, data.radiologyTestId])
          .filter(Boolean)
      ),
    ];
    const [patients, tests] = await Promise.all([
      prisma.patient.findMany({
        where: { tenantId: tid, id: { in: patientIds } },
        select: { id: true, name: true, mobile: true, patientNumber: true },
      }),
      prisma.moduleRecord.findMany({
        where: { tenantId: tid, id: { in: testIds } },
        select: { id: true, title: true },
      }),
    ]);
    const patientMap = new Map(
        patients.map((patient) => [patient.id, patient])
      ),
      testMap = new Map(tests.map((test) => [test.id, test.title]));
    const doctorLogs = doctorAppointments.flatMap((appointment) => {
      const payments = appointment.payments.length
        ? appointment.payments
        : [
            {
              id: `appointment-${appointment.id}`,
              provider: "UNRECORDED",
              providerTransactionId: null,
              amount: appointment.amount,
              currency: "INR",
              status: appointment.paymentStatus,
              confirmedAt: appointment.paymentConfirmedAt,
              createdAt: appointment.createdAt,
            },
          ];
      return payments.map((payment) => ({
        id: payment.id,
        serviceType: "DOCTOR",
        serviceName: appointment.doctor.name,
        customerName: appointment.patient.name,
        customerMobile: appointment.patient.mobile,
        patientNumber: appointment.patient.patientNumber,
        appointmentNumber: appointment.appointmentNumber,
        provider: payment.provider,
        transactionId: payment.providerTransactionId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        date: payment.confirmedAt || payment.createdAt,
        collectedById:
          "collectedById" in payment ? payment.collectedById : null,
      }));
    });
    const diagnosticLogs = diagnosticData.map(({ row, data }) => {
      const patient = patientMap.get(data.patientId),
        isLab = row.module === "lab-appointments";
      return {
        id: row.id,
        serviceType: isLab ? "LAB" : "RADIOLOGY",
        serviceName:
          data.testNames ||
          testMap.get(isLab ? data.labTestId : data.radiologyTestId) ||
          "Unknown test",
        customerName: patient?.name || "Unknown patient",
        customerMobile: patient?.mobile,
        patientNumber: patient?.patientNumber,
        appointmentNumber:
          row.title === "Untitled record"
            ? row.id.slice(-8).toUpperCase()
            : row.title,
        provider: data.paymentMethod || "UNRECORDED",
        transactionId: data.transactionId || null,
        subtotal: Number(data.subtotal || data.amount || 0),
        discountAmount: Number(data.discountAmount || 0),
        amount: Number(data.amount || 0),
        currency: data.currency || "INR",
        status: data.paymentStatus || row.status,
        date: data.appointmentAt || row.createdAt,
        collectedById: data.paymentCollectedById || null,
      };
    });
    const allItems = [...doctorLogs, ...diagnosticLogs];
    const items = (
      isAdmin
        ? allItems
        : allItems.filter((item) => item.collectedById === req.user!.id)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return ok(res, { items, total: items.length });
  })
);
crmRouter.get(
  "/modules/:module",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    let items = await prisma.moduleRecord.findMany({
      where: { tenantId: tid, module: req.params.module },
      orderBy: { createdAt: "desc" },
    });
    if (req.params.module === "specimen-tubes" && !items.length) {
      await prisma.moduleRecord.createMany({
        data: defaultSpecimenTubes.map(([code, title, sampleType, capColor, additive, volume]) => ({
          tenantId: tid,
          module: "specimen-tubes",
          title,
          status: "ACTIVE",
          data: { code, sampleType, capColor, additive, volume },
        })),
      });
      items = await prisma.moduleRecord.findMany({
        where: { tenantId: tid, module: req.params.module },
        orderBy: { createdAt: "asc" },
      });
    }
    return ok(res, { items, total: items.length, page: 1, limit: 100 });
  })
);
crmRouter.get(
  "/modules/:module/:id/logs",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      record = await prisma.moduleRecord.findFirst({
        where: { id: req.params.id, tenantId: tid, module: req.params.module },
      });
    if (!record) throw new AppError(404, "Appointment not found", "NOT_FOUND");
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: tid, entityId: record.id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, logs);
  })
);
crmRouter.post(
  "/modules/:module/:id/whatsapp/retry",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req),
      record = await prisma.moduleRecord.findFirst({
        where: { id: req.params.id, tenantId: tid, module: req.params.module },
      });
    if (
      !record ||
      !["lab-appointments", "radiology-appointments"].includes(record.module)
    )
      throw new AppError(404, "Diagnostic appointment not found", "NOT_FOUND");
    await notifyDiagnostic(req, record, undefined, true);
    return ok(res, null, "WhatsApp message sent successfully");
  })
);
crmRouter.post(
  "/modules/:module",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const { title, status = "ACTIVE", ...data } = req.body;
    if (
      ["lab-appointments", "radiology-appointments"].includes(
        req.params.module
      ) &&
      data.paymentStatus === "PAID"
    )
      data.paymentCollectedById = req.user!.id;
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
    await notifyDiagnostic(req, row);
    return ok(res, row, "Created successfully", 201);
  })
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
    const previousData = found.data as Record<string, any>;
    if (
      ["lab-appointments", "radiology-appointments"].includes(
        req.params.module
      ) &&
      data.paymentStatus === "PAID" &&
      previousData.paymentStatus !== "PAID"
    )
      data.paymentCollectedById = req.user!.id;
    const row = await prisma.moduleRecord.update({
      where: { id: found.id },
      data: {
        title: title || found.title,
        status: status || found.status,
        data: { ...(found.data as object), ...data },
      },
    });
    await audit(req, `${req.params.module}.updated`, "ModuleRecord", row.id);
    await notifyDiagnostic(req, row, {
      ...(found.data as object),
      status: found.status,
    });
    return ok(res, row, "Updated successfully");
  })
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
  })
);
crmRouter.get(
  "/clinic-profile",
  asyncRoute(async (req, res) => {
    const profile = await prisma.tenant.findUnique({
      where: { id: tenantId(req) },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        mobile: true,
        address: true,
      },
    });
    if (!profile) throw new AppError(404, "Clinic not found", "NOT_FOUND");
    return ok(res, profile);
  })
);
crmRouter.patch(
  "/clinic-profile",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const data = z
      .object({
        name: z.string().trim().min(2).max(120),
        logoUrl: z.string().max(1_500_000).nullable().optional(),
        mobile: z.string().trim().min(8).max(20),
        address: z.string().trim().min(3).max(500),
      })
      .parse(req.body);
    if (
      data.logoUrl &&
      !/^data:image\/(png|jpeg|webp);base64,/i.test(data.logoUrl)
    )
      throw new AppError(
        400,
        "Logo must be a PNG, JPEG, or WebP image",
        "INVALID_LOGO"
      );
    const before = await prisma.tenant.findUnique({ where: { id: tid } });
    if (!before) throw new AppError(404, "Clinic not found", "NOT_FOUND");
    const profile = await prisma.tenant.update({ where: { id: tid }, data });
    const changes = Object.fromEntries(
      Object.keys(data)
        .filter(
          (key) =>
            JSON.stringify((before as any)[key]) !==
            JSON.stringify((profile as any)[key])
        )
        .map((key) => [
          key,
          {
            from:
              key === "logoUrl"
                ? Boolean((before as any)[key])
                : (before as any)[key] ?? null,
            to:
              key === "logoUrl"
                ? Boolean((profile as any)[key])
                : (profile as any)[key] ?? null,
          },
        ])
    );
    await audit(req, "clinic.profile.updated", "Tenant", tid, { changes });
    return ok(
      res,
      {
        id: profile.id,
        name: profile.name,
        logoUrl: profile.logoUrl,
        mobile: profile.mobile,
        address: profile.address,
      },
      "Clinic settings saved"
    );
  })
);
crmRouter.get(
  "/appointments/:id/logs",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, tenantId: tid },
      select: { id: true },
    });
    if (!appointment)
      throw new AppError(404, "Appointment not found", "NOT_FOUND");
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: tid, entityId: appointment.id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, logs);
  })
);
crmRouter.get(
  "/appointments/calendar",
  asyncRoute(async (req, res) => {
    const from = z.coerce.date().parse(req.query.from),
      to = z.coerce.date().parse(req.query.to);
    if (to <= from || to.getTime() - from.getTime() > 370 * 86400000)
      throw new AppError(
        400,
        "Invalid calendar date range",
        "INVALID_DATE_RANGE"
      );
    const appointments = await prisma.appointment.findMany({
      where: { tenantId: tenantId(req), startsAt: { gte: from, lt: to } },
      include: {
        patient: { select: { id: true, name: true, patientNumber: true } },
        doctor: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    });
    return ok(res, appointments);
  })
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
  })
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
    const [patient, branch, department, doctor, schedule, tenant] =
      await Promise.all([
        prisma.patient.findFirst({
          where: { id: body.patientId, tenantId: tid },
        }),
        prisma.branch.findFirst({
          where: { id: body.branchId, tenantId: tid },
        }),
        prisma.department.findFirst({
          where: { id: body.departmentId, tenantId: tid },
        }),
        prisma.doctor.findFirst({
          where: { id: body.doctorId, tenantId: tid },
        }),
        prisma.doctorSchedule.findFirst({
          where: {
            id: body.scheduleId,
            tenantId: tid,
            doctorId: body.doctorId,
            branchId: body.branchId,
            status: "ACTIVE",
          },
        }),
        prisma.tenant.findUnique({ where: { id: tid } }),
      ]);
    if (
      !patient ||
      !branch ||
      !department ||
      !doctor ||
      !schedule?.scheduleDate ||
      !tenant
    )
      throw new AppError(
        400,
        "Patient, doctor, branch, department or schedule is invalid",
        "INVALID_BOOKING"
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
          "DUPLICATE_APPOINTMENT"
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
          "SCHEDULE_FULL"
        );
      const serialNumber = booked + 1,
        startsAt = new Date(`${date}T${schedule.startTime}:00+05:30`),
        slotStart = new Date(
          startsAt.getTime() + booked * schedule.slotMinutes * 60000
        ),
        scheduleEnd = new Date(`${date}T${schedule.endTime}:00+05:30`);
      if (slotStart >= scheduleEnd)
        throw new AppError(
          409,
          "No appointment slots remain within the doctor's schedule",
          "SCHEDULE_FULL"
        );
      const paymentComplete =
        body.paymentStatus === "PAID" || body.paymentStatus === "NOT_REQUIRED";
      const token = paymentComplete
        ? appointmentToken(
            doctor.name,
            department.name,
            department.code,
            slotStart,
            serialNumber
          )
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
          status:
            body.paymentStatus === "PENDING" ? "PAYMENT_PENDING" : body.status,
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
                    collectedById: req.user!.id,
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
    if (result.paymentStatus === "PENDING") {
      try {
        const paymentLink = await ensureRazorpayPaymentLink({
          id: result.id,
          tenantId: result.tenantId,
          appointmentNumber: result.appointmentNumber,
          amount: result.amount,
          patientName: patient.name,
          patientMobile: patient.mobile,
          patientEmail: patient.email,
        });
        await audit(
          req,
          "appointment.razorpay_link.created",
          "Appointment",
          result.id,
          {
            paymentLinkId: paymentLink.id,
          }
        );
      } catch (error) {
        await audit(
          req,
          "appointment.razorpay_link.failed",
          "Appointment",
          result.id,
          {
            error:
              error instanceof Error ? error.message : "Unknown Razorpay error",
          }
        );
      }
    }
    const message: AppointmentMessage = {
      appointmentId: result.id,
      tenantId: result.tenantId,
      appointmentNumber: result.appointmentNumber,
      patientName: patient.name,
      patientMobile: patient.mobile,
      patientNumber: patient.patientNumber,
      clinicName: tenant.name,
      clinicPhone: tenant.mobile,
      doctorName: doctor.name,
      departmentName: department.name,
      branchName: branch.name,
      startsAt: result.startsAt,
      amount: result.amount,
      token: result.token,
    };
    if (result.paymentStatus === "PENDING")
      await notifyAppointment(req, "payment_pending", message);
    else if (result.paymentStatus === "PAID")
      await notifyAppointment(req, "payment_success", message);
    return ok(
      res,
      result,
      result.paymentStatus === "PENDING"
        ? "Appointment slot held pending payment"
        : "Appointment booked successfully",
      201
    );
  })
);
crmRouter.post(
  "/appointments/:id/whatsapp/retry",
  asyncRoute(async (req, res) => {
    const tid = tenantId(req);
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, tenantId: tid },
      include: {
        tenant: true,
        patient: true,
        doctor: true,
        department: true,
        branch: true,
      },
    });
    if (!appointment)
      throw new AppError(404, "Appointment not found", "NOT_FOUND");

    const message: AppointmentMessage = {
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
      appointmentNumber: appointment.appointmentNumber,
      patientName: appointment.patient.name,
      patientMobile: appointment.patient.mobile,
      patientNumber: appointment.patient.patientNumber,
      clinicName: appointment.tenant.name,
      clinicPhone: appointment.tenant.mobile,
      doctorName: appointment.doctor.name,
      departmentName: appointment.department.name,
      branchName: appointment.branch.name,
      startsAt: appointment.startsAt,
      amount: appointment.amount,
      token: appointment.token,
    };

    try {
      const kind =
        appointment.status === "CANCELLED"
          ? "cancelled"
          : appointment.paymentStatus === "PENDING"
          ? "payment_pending"
          : "payment_success";
      if (kind === "payment_success" && !appointment.token)
        throw new Error("Paid appointment does not have a token yet");
      const paymentLink =
        kind === "payment_pending"
          ? await ensureRazorpayPaymentLink({
              id: appointment.id,
              tenantId: appointment.tenantId,
              appointmentNumber: appointment.appointmentNumber,
              amount: appointment.amount,
              patientName: appointment.patient.name,
              patientMobile: appointment.patient.mobile,
              patientEmail: appointment.patient.email,
            })
          : null;
      const delivery =
        kind === "cancelled"
          ? await sendCancelledMessage(
              message,
              appointment.cancellationReason || "Cancelled by clinic"
            )
          : kind === "payment_pending"
          ? await sendPaymentPendingMessage(message, paymentLink!.short_url)
          : await sendPaymentSuccessMessage(message);
      if (!delivery.sent)
        throw new Error(delivery.reason || "AiSensy did not send the message");
      await audit(
        req,
        `appointment.whatsapp.${kind}.resent`,
        "Appointment",
        appointment.id,
        delivery
      );
      return ok(res, delivery, "WhatsApp message sent successfully");
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown AiSensy error";
      await audit(
        req,
        "appointment.whatsapp.retry.failed",
        "Appointment",
        appointment.id,
        { error: reason }
      );
      throw new AppError(
        502,
        `WhatsApp message failed: ${reason}`,
        "AISENSY_SEND_FAILED"
      );
    }
  })
);
crmRouter.post(
  "/bulk/:resource",
  asyncRoute(async (req, res) => {
    const resource = req.params.resource;
    if (!["leads", "patients"].includes(resource))
      throw new AppError(
        404,
        "Bulk import is not available for this resource",
        "NOT_FOUND"
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
          data.patientNumber = `PT-${stamp}-${String(index + 1).padStart(
            3,
            "0"
          )}`;
        output.push(await (model as any).create({ data }));
      }
      return output;
    });
    await audit(req, `${resource}.bulk_imported`, resource, undefined, {
      count: created.length,
    });
    return ok(res, { count: created.length }, "Bulk import completed", 201);
  })
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
      row.id
    );
    return ok(res, row, "Created successfully", 201);
  })
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
        : "Lead status updated"
    );
  })
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
          "DUPLICATE_APPOINTMENT"
        );

      const schedules = await prisma.doctorSchedule.findMany({
        where: {
          tenantId: tid,
          doctorId,
          branchId: data.branchId || appointment.branchId,
          status: "ACTIVE",
          scheduleDate: { gte: dayStart, lt: dayEnd },
        },
      });
      const selectedMinutes = Number(
        data.startsAt
          .toLocaleTimeString("en-GB", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
          .replace(":", "")
      );
      const schedule = schedules.find((item) => {
        const [sh, sm] = item.startTime.split(":").map(Number);
        const [eh, em] = item.endTime.split(":").map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        const chosenMinutes =
          Math.floor(selectedMinutes / 100) * 60 + (selectedMinutes % 100);
        return (
          chosenMinutes >= startMinutes &&
          chosenMinutes < endMinutes &&
          (chosenMinutes - startMinutes) % item.slotMinutes === 0
        );
      });
      if (!schedule)
        throw new AppError(
          409,
          "The selected slot is not available in this doctor's schedule",
          "SLOT_NOT_AVAILABLE"
        );
      data.endsAt = new Date(
        data.startsAt.getTime() + schedule.slotMinutes * 60000
      );
      if (
        data.status === "RESCHEDULED" &&
        data.startsAt.getTime() === appointment.startsAt.getTime()
      )
        throw new AppError(400, "Please select a different slot", "SAME_SLOT");
    }
    if (req.params.resource === "appointments") {
      const appointment = found as any;
      if (data.status === "CANCELLED")
        data.cancellationReason = z
          .string()
          .trim()
          .min(3)
          .max(250)
          .parse(req.body.cancellationReason || "Cancelled by clinic");
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
          throw new AppError(
            400,
            "Doctor or department is invalid",
            "INVALID_APPOINTMENT"
          );
        if (!appointment.token)
          data.token = appointmentToken(
            doctor.name,
            department.name,
            department.code,
            data.startsAt || appointment.startsAt,
            appointment.serialNumber || 1
          );
        data.status = "CONFIRMED";
        if (data.paymentStatus === "PAID") {
          data.paymentConfirmedAt = new Date();
          if (appointment.paymentStatus !== "PAID") {
            const paymentMethod = z
              .enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"])
              .parse(req.body.paymentMethod);
            const utrNumber = z
              .string()
              .trim()
              .max(100)
              .optional()
              .parse(req.body.utrNumber);
            if (paymentMethod !== "CASH" && !utrNumber)
              throw new AppError(
                400,
                "UTR or transaction number is required",
                "PAYMENT_REFERENCE_REQUIRED"
              );
            data.payments = {
              create: {
                tenantId: tid,
                provider: paymentMethod,
                providerTransactionId: utrNumber || null,
                remarks:
                  z
                    .string()
                    .trim()
                    .max(500)
                    .optional()
                    .parse(req.body.paymentRemarks) || null,
                amount: Number(data.amount ?? appointment.amount),
                status: "PAID",
                secureToken: randomUUID(),
                confirmedAt: new Date(),
                collectedById: req.user!.id,
              },
            };
          }
        }
      }
    }
    const row = await model.update({ where: { id: found.id }, data });
    const before = JSON.parse(JSON.stringify(found));
    const after = JSON.parse(JSON.stringify(row));
    const changes = Object.fromEntries(
      Object.keys(data)
        .filter(
          (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
        )
        .map((key) => [
          key,
          { from: before[key] ?? null, to: after[key] ?? null },
        ])
    );
    await audit(
      req,
      req.params.resource === "appointments" && data.status === "RESCHEDULED"
        ? "appointment.rescheduled"
        : `${req.params.resource}.updated`,
      req.params.resource,
      row.id,
      { changes }
    );
    if (req.params.resource === "appointments") {
      const becamePaid =
        (found as any).paymentStatus !== "PAID" &&
        (row as any).paymentStatus === "PAID";
      const becameCancelled =
        (found as any).status !== "CANCELLED" &&
        (row as any).status === "CANCELLED";
      const wasRescheduled =
        (row as any).status === "RESCHEDULED" &&
        new Date((found as any).startsAt).getTime() !==
          new Date((row as any).startsAt).getTime();
      if (becamePaid || becameCancelled || wasRescheduled) {
        const full = await prisma.appointment.findUnique({
          where: { id: row.id },
          include: {
            tenant: true,
            patient: true,
            doctor: true,
            department: true,
            branch: true,
          },
        });
        if (full)
          await notifyAppointment(
            req,
            becamePaid
              ? "payment_success"
              : becameCancelled
              ? "cancelled"
              : "rescheduled",
            {
              appointmentId: full.id,
              tenantId: full.tenantId,
              appointmentNumber: full.appointmentNumber,
              patientName: full.patient.name,
              patientMobile: full.patient.mobile,
              patientNumber: full.patient.patientNumber,
              clinicName: full.tenant.name,
              clinicPhone: full.tenant.mobile,
              doctorName: full.doctor.name,
              departmentName: full.department.name,
              branchName: full.branch.name,
              startsAt: full.startsAt,
              amount: full.amount,
              token: full.token,
            },
            becameCancelled
              ? {
                  cancellationReason:
                    full.cancellationReason || "Cancelled by clinic",
                }
              : wasRescheduled
              ? { previousStartsAt: new Date((found as any).startsAt) }
              : undefined
          );
      }
    }
    return ok(res, row, "Updated successfully");
  })
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
    if (req.params.resource === "appointments") {
      // Payments reference an appointment without a database-level cascade.
      // Remove those dependent rows first so paid appointments can be deleted.
      await prisma.$transaction(async (tx) => {
        await tx.payment.deleteMany({
          where: { appointmentId: found.id, tenantId: tid },
        });
        await tx.appointment.delete({ where: { id: found.id } });
      });
    } else {
      await model.delete({ where: { id: found.id } });
    }
    await audit(
      req,
      `${req.params.resource}.deleted`,
      req.params.resource,
      found.id,
      { deletedRecord: JSON.parse(JSON.stringify(found)) }
    );
    return ok(res, null, "Deleted successfully");
  })
);
