import { createHash, randomInt } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { config } from "../config.js";
import { AppError, asyncRoute, ok, prisma } from "../lib.js";
import { sendCollectionOtp } from "../aisensy.js";

export const patientRouter = Router();
type PatientRequest = Request & { patient?: { id: string; tenantId: string } };
const otpHash = (tenantId: string, mobile: string, otp: string) =>
  createHash("sha256")
    .update(`${config.JWT_SECRET}:${tenantId}:${mobile}:${otp}`)
    .digest("hex");
const digits = (value: string) => value.replace(/\D/g, "").slice(-10);
const patientAuth = (
  req: PatientRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token)
      throw new AppError(
        401,
        "Patient login required",
        "PATIENT_LOGIN_REQUIRED"
      );
    const payload = jwt.verify(token, config.JWT_SECRET) as any;
    if (payload.portal !== "PATIENT" || !payload.patientId || !payload.tenantId)
      throw new Error("Invalid patient token");
    req.patient = { id: payload.patientId, tenantId: payload.tenantId };
    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError(
            401,
            "Patient session expired",
            "PATIENT_SESSION_EXPIRED"
          )
    );
  }
};

patientRouter.get(
  "/clinics",
  asyncRoute(async (_req, res) => {
    const clinics = await prisma.tenant.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        city: true,
        state: true,
        address: true,
      },
      orderBy: { name: "asc" },
    });
    return ok(res, clinics);
  })
);

patientRouter.post(
  "/doctor-bookings",
  patientAuth,
  asyncRoute(async (req: PatientRequest, res) => {
    const body = z
      .object({
        doctorId: z.string(),
        branchId: z.string(),
        startsAt: z.coerce.date(),
        visitType: z.enum(["CLINIC", "VIDEO"]).default("CLINIC"),
        notes: z.string().max(300).optional(),
      })
      .parse(req.body);
    const { id: patientId, tenantId } = req.patient!;
    const doctor = await prisma.doctor.findFirst({
      where: {
        id: body.doctorId,
        tenantId,
        status: "ACTIVE",
        branches: { some: { branchId: body.branchId } },
      },
      include: { department: true },
    });
    if (!doctor?.departmentId)
      throw new AppError(
        400,
        "This doctor is not available for patient booking",
        "DOCTOR_UNAVAILABLE"
      );
    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        branchId: body.branchId,
        departmentId: doctor.departmentId,
        doctorId: doctor.id,
        appointmentNumber: `APT-${Date.now().toString(36).toUpperCase()}`,
        startsAt: body.startsAt,
        endsAt: new Date(body.startsAt.getTime() + 30 * 60_000),
        amount: doctor.consultationFee,
        status: "BOOKING_PENDING",
        paymentStatus: "PENDING",
      },
    });
    await prisma.moduleRecord.create({
      data: {
        tenantId,
        module: "patient-booking-notes",
        title: appointment.appointmentNumber,
        status: "ACTIVE",
        data: {
          patientId,
          appointmentId: appointment.id,
          visitType: body.visitType,
          notes: body.notes || "",
        },
      },
    });
    return ok(res, appointment, "Doctor appointment booked", 201);
  })
);

patientRouter.post(
  "/lab-bookings",
  patientAuth,
  asyncRoute(async (req: PatientRequest, res) => {
    const body = z
      .object({
        testIds: z.array(z.string()).min(1),
        appointmentAt: z.coerce.date(),
        collectionType: z.enum(["HOME", "LAB"]),
        address: z.string().max(500).optional(),
        notes: z.string().max(300).optional(),
      })
      .parse(req.body);
    const { id: patientId, tenantId } = req.patient!;
    const selected = await prisma.moduleRecord.findMany({
      where: {
        tenantId,
        module: "lab-tests",
        id: { in: body.testIds },
        status: "ACTIVE",
      },
    });
    if (selected.length !== new Set(body.testIds).size)
      throw new AppError(
        400,
        "One or more tests are unavailable",
        "TEST_UNAVAILABLE"
      );
    const amount = selected.reduce(
      (sum, test) => sum + Number((test.data as any)?.price || 0),
      0
    );
    const order = await prisma.moduleRecord.create({
      data: {
        tenantId,
        module: "lab-appointments",
        title: `LAB-${Date.now().toString(36).toUpperCase()}`,
        status: "BOOKING_PENDING",
        data: {
          patientId,
          appointmentAt: body.appointmentAt.toISOString(),
          collectionType: body.collectionType,
          address: body.address || "",
          instructions: body.notes || "",
          testIds: selected.map((test) => test.id),
          testNames: selected.map((test) => test.title).join(", "),
          subtotal: amount,
          discountAmount: 0,
          amount,
          paymentStatus: "PENDING",
          source: "PATIENT_APP",
        },
      },
    });
    return ok(res, order, "Lab tests booked", 201);
  })
);

patientRouter.post(
  "/auth/request-otp",
  asyncRoute(async (req, res) => {
    const body = z
        .object({ tenantId: z.string(), mobile: z.string().min(10) })
        .parse(req.body),
      mobile = digits(body.mobile);
    const [patient, clinic] = await Promise.all([
      prisma.patient.findFirst({
        where: {
          tenantId: body.tenantId,
          mobile: { endsWith: mobile },
          status: "ACTIVE",
        },
      }),
      prisma.tenant.findFirst({
        where: { id: body.tenantId, status: { in: ["ACTIVE", "TRIAL"] } },
      }),
    ]);
    if (!patient || !clinic)
      throw new AppError(
        404,
        "No patient account was found at this clinic",
        "PATIENT_NOT_FOUND"
      );
    const otp = String(randomInt(100000, 1000000)),
      expiresAt = new Date(Date.now() + 10 * 60_000);
    await prisma.moduleRecord.updateMany({
      where: {
        tenantId: clinic.id,
        module: "patient-login-otp",
        title: mobile,
        status: "PENDING",
      },
      data: { status: "EXPIRED" },
    });
    await prisma.moduleRecord.create({
      data: {
        tenantId: clinic.id,
        module: "patient-login-otp",
        title: mobile,
        status: "PENDING",
        data: {
          patientId: patient.id,
          hash: otpHash(clinic.id, mobile, otp),
          expiresAt: expiresAt.toISOString(),
          attempts: 0,
        },
      },
    });
    const message = {
      appointmentId: patient.id,
      tenantId: clinic.id,
      patientName: patient.name,
      patientMobile: patient.mobile,
      patientNumber: patient.patientNumber,
      clinicName: clinic.name,
      clinicPhone: clinic.mobile,
      doctorName: "CareFlow360",
      departmentName: "Patient portal",
      branchName: clinic.city || "Clinic",
      appointmentNumber: "PATIENT-LOGIN",
      startsAt: new Date(),
      amount: 0,
    };
    const delivery = await sendCollectionOtp(message, otp);
    if (!delivery.sent && config.NODE_ENV === "production")
      throw new AppError(
        503,
        delivery.reason || "OTP service is unavailable",
        "OTP_DELIVERY_FAILED"
      );
    return ok(
      res,
      {
        expiresInMinutes: 10,
        destination: `******${mobile.slice(-4)}`,
        ...(config.NODE_ENV !== "production" ? { debugOtp: otp } : {}),
      },
      "Verification code sent"
    );
  })
);

patientRouter.post(
  "/auth/verify-otp",
  asyncRoute(async (req, res) => {
    const body = z
        .object({
          tenantId: z.string(),
          mobile: z.string().min(10),
          otp: z.string().length(6),
        })
        .parse(req.body),
      mobile = digits(body.mobile);
    const row = await prisma.moduleRecord.findFirst({
      where: {
        tenantId: body.tenantId,
        module: "patient-login-otp",
        title: mobile,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row)
      throw new AppError(
        400,
        "Request a new verification code",
        "OTP_NOT_FOUND"
      );
    const data = row.data as any;
    if (new Date(data.expiresAt) < new Date()) {
      await prisma.moduleRecord.update({
        where: { id: row.id },
        data: { status: "EXPIRED" },
      });
      throw new AppError(400, "Verification code expired", "OTP_EXPIRED");
    }
    if (Number(data.attempts || 0) >= 5)
      throw new AppError(429, "Too many verification attempts", "OTP_LOCKED");
    if (data.hash !== otpHash(body.tenantId, mobile, body.otp)) {
      await prisma.moduleRecord.update({
        where: { id: row.id },
        data: { data: { ...data, attempts: Number(data.attempts || 0) + 1 } },
      });
      throw new AppError(400, "Incorrect verification code", "OTP_INCORRECT");
    }
    const patient = await prisma.patient.findFirst({
      where: { id: data.patientId, tenantId: body.tenantId, status: "ACTIVE" },
    });
    if (!patient)
      throw new AppError(
        404,
        "Patient account no longer exists",
        "PATIENT_NOT_FOUND"
      );
    await prisma.moduleRecord.update({
      where: { id: row.id },
      data: { status: "VERIFIED" },
    });
    const accessToken = jwt.sign(
      { patientId: patient.id, tenantId: patient.tenantId, portal: "PATIENT" },
      config.JWT_SECRET,
      { expiresIn: "30d" }
    );
    return ok(
      res,
      {
        accessToken,
        patient: {
          id: patient.id,
          patientNumber: patient.patientNumber,
          name: patient.name,
          mobile: patient.mobile,
          email: patient.email,
          gender: patient.gender,
          dob: patient.dob,
          address: patient.address,
          city: patient.city,
          state: patient.state,
          pin: patient.pin,
        },
      },
      "Patient login successful"
    );
  })
);

patientRouter.get(
  "/bootstrap",
  patientAuth,
  asyncRoute(async (req: PatientRequest, res) => {
    const { id: patientId, tenantId } = req.patient!;
    const [
      patient,
      clinic,
      doctors,
      labTests,
      appointments,
      diagnostics,
      reports,
    ] = await Promise.all([
      prisma.patient.findFirst({ where: { id: patientId, tenantId } }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          mobile: true,
          address: true,
          city: true,
          state: true,
          pin: true,
        },
      }),
      prisma.doctor.findMany({
        where: { tenantId, status: "ACTIVE" },
        include: {
          department: true,
          branches: { include: { branch: true } },
          schedules: { where: { status: "ACTIVE" } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.moduleRecord.findMany({
        where: { tenantId, module: "lab-tests", status: "ACTIVE" },
        orderBy: { title: "asc" },
      }),
      prisma.appointment.findMany({
        where: { tenantId, patientId },
        include: {
          doctor: true,
          department: true,
          branch: true,
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { startsAt: "desc" },
      }),
      prisma.moduleRecord.findMany({
        where: {
          tenantId,
          module: { in: ["lab-appointments", "radiology-appointments"] },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.moduleRecord.findMany({
        where: {
          tenantId,
          module: { in: ["lab-reports", "radiology-reports", "reports"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!patient || !clinic)
      throw new AppError(404, "Patient or clinic not found", "NOT_FOUND");
    const belongsToPatient = (row: { data: unknown }) =>
      (row.data as any)?.patientId === patientId;
    return ok(res, {
      patient,
      clinic,
      doctors,
      labTests,
      appointments,
      diagnostics: diagnostics.filter(belongsToPatient),
      reports: reports.filter(belongsToPatient),
    });
  })
);
