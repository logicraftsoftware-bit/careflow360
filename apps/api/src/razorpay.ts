import { createHmac, timingSafeEqual } from "node:crypto";
import { appointmentToken, decryptIntegrationSecret, sendPaymentSuccessMessage, type AppointmentMessage } from "./aisensy.js";
import { config } from "./config.js";
import { prisma } from "./lib.js";

const indianContact = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

export async function ensureRazorpayPaymentLink(appointment: {
  id: string;
  tenantId: string;
  appointmentNumber: string;
  amount: number;
  patientName: string;
  patientMobile: string;
  patientEmail?: string | null;
}) {
  const existing = await prisma.payment.findFirst({
    where: {
      appointmentId: appointment.id,
      provider: "RAZORPAY_PAYMENT_LINK",
      status: "PENDING",
      paymentUrl: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.paymentUrl)
    return { id: existing.providerTransactionId || existing.id, short_url: existing.paymentUrl };

  const integration = await prisma.razorpayIntegration.findUnique({
    where: { tenantId: appointment.tenantId },
  });
  if (!integration?.isActive)
    throw new Error("Razorpay is not configured or active for this clinic");
  const keySecret = decryptIntegrationSecret(integration.keySecretEncrypted);
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${integration.keyId}:${keySecret}`).toString("base64")}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      amount: Math.round(appointment.amount * 100),
      currency: "INR",
      accept_partial: false,
      description: `Consultation fee for ${appointment.appointmentNumber}`,
      customer: {
        name: appointment.patientName,
        contact: indianContact(appointment.patientMobile),
        ...(appointment.patientEmail ? { email: appointment.patientEmail } : {}),
      },
      notify: { sms: false, email: false },
      reminder_enable: true,
      callback_url: `${config.APP_URL.replace(/\/$/, "")}/payment/${encodeURIComponent(appointment.appointmentNumber)}`,
      callback_method: "get",
      notes: {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        appointmentNumber: appointment.appointmentNumber,
      },
    }),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`Razorpay returned ${response.status}: ${text.slice(0, 500)}`);
  const link = JSON.parse(text) as { id: string; short_url: string; expire_by?: number };
  if (!link.id || !link.short_url) throw new Error("Razorpay did not return a payment link");
  await prisma.payment.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      provider: "RAZORPAY_PAYMENT_LINK",
      providerTransactionId: link.id,
      paymentUrl: link.short_url,
      amount: appointment.amount,
      status: "PENDING",
      secureToken: crypto.randomUUID(),
      expiresAt: link.expire_by ? new Date(link.expire_by * 1000) : null,
    },
  });
  return link;
}

export function verifyRazorpaySignature(rawBody: Buffer, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(signature || "", "utf8");
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function confirmRazorpayAppointment(appointmentId: string, paymentId?: string) {
  const full = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { tenant: true, patient: true, doctor: true, department: true, branch: true },
  });
  if (!full) throw new Error("Appointment not found");
  if (full.paymentStatus === "PAID" && full.token) return full;
  const token = full.token || appointmentToken(full.doctor.name, full.department.name, full.department.code, full.startsAt, full.serialNumber || 1);
  const appointment = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id: full.id },
      data: { paymentStatus: "PAID", status: "CONFIRMED", paymentConfirmedAt: new Date(), token },
    });
    await tx.payment.updateMany({
      where: { appointmentId: full.id, provider: "RAZORPAY_PAYMENT_LINK" },
      data: { status: "PAID", providerPaymentId: paymentId || null, confirmedAt: new Date() },
    });
    await tx.auditLog.create({
      data: { tenantId: full.tenantId, action: "appointment.payment.razorpay_confirmed", entityType: "Appointment", entityId: full.id, metadata: { paymentId: paymentId || null, token } },
    });
    return updated;
  });
  const message: AppointmentMessage = {
    appointmentId: full.id, tenantId: full.tenantId, appointmentNumber: full.appointmentNumber,
    patientName: full.patient.name, patientMobile: full.patient.mobile, patientNumber: full.patient.patientNumber,
    clinicName: full.tenant.name, clinicPhone: full.tenant.mobile, doctorName: full.doctor.name,
    departmentName: full.department.name, branchName: full.branch.name, startsAt: full.startsAt,
    amount: full.amount, token,
  };
  try {
    const delivery = await sendPaymentSuccessMessage(message);
    await prisma.auditLog.create({ data: { tenantId: full.tenantId, action: `appointment.whatsapp.payment_success.${delivery.sent ? "sent" : "skipped"}`, entityType: "Appointment", entityId: full.id, metadata: delivery } });
  } catch (error) {
    await prisma.auditLog.create({ data: { tenantId: full.tenantId, action: "appointment.whatsapp.payment_success.failed", entityType: "Appointment", entityId: full.id, metadata: { error: error instanceof Error ? error.message : "Unknown AiSensy error" } } });
  }
  return appointment;
}
