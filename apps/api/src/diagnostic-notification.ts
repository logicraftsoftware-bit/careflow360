import { audit, prisma, AppError } from "./lib.js";
import { sendDiagnosticMessage, type AppointmentMessage } from "./aisensy.js";
import { ensureDiagnosticPaymentLink } from "./cashfree.js";

export async function notifyDiagnostic(
  req: Parameters<typeof audit>[0],
  row: any,
  previous?: any,
  strict = false
) {
  const data = row.data as any;
  if (
    !["lab-appointments", "radiology-appointments"].includes(row.module) ||
    !data?.patientId ||
    (data.sendWhatsApp === false && !strict)
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
  if (!patient || !clinic) return { sent: false, reason: "Patient or clinic details are missing" };
  const message: AppointmentMessage = {
    appointmentId: row.id,
    tenantId: row.tenantId,
    appointmentNumber: row.title,
    patientName: patient.name,
    patientMobile: patient.mobile,
    patientNumber: patient.patientNumber,
    clinicName: clinic.name,
    clinicPhone: clinic.mobile,
    doctorName: data.referringDoctorName || (row.module === "lab-appointments" ? "Laboratory" : "Radiology"),
    departmentName: data.testNames || "Diagnostic test",
    branchName: data.branchName || "Clinic",
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
    let paymentUrl: string | undefined;
    if (kind === "payment_pending") {
      try {
        paymentUrl = (await ensureDiagnosticPaymentLink(row, patient)).short_url;
      } catch (error) {
        await audit(req, `${row.module}.payment_link.failed`, "ModuleRecord", row.id, {
          error: error instanceof Error ? error.message : "Unable to create payment link",
        });
        paymentUrl = `Please contact ${clinic.name} at ${clinic.mobile} for payment.`;
      }
    }
    const delivery = await sendDiagnosticMessage(kind, message, {
      previousStartsAt: previous?.appointmentAt
        ? new Date(previous.appointmentAt)
        : undefined,
      cancellationReason: data.cancellationReason,
      paymentUrl,
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
    return delivery;
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
    return { sent: false, reason: "WhatsApp could not be sent. Check the appointment WhatsApp logs and clinic AiSensy settings, then retry from the appointment list." };
  }
}
