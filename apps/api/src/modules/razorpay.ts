import { Router } from "express";
import { decryptIntegrationSecret } from "../aisensy.js";
import { asyncRoute, prisma } from "../lib.js";
import { confirmRazorpayAppointment, verifyRazorpaySignature } from "../razorpay.js";

export const razorpayRouter = Router();

const entityNotes = (payload: any) =>
  payload?.payment_link?.entity?.notes || payload?.payment?.entity?.notes || {};

razorpayRouter.post("/webhook", asyncRoute(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  let event: any;
  try { event = JSON.parse(rawBody.toString("utf8")); }
  catch { return res.status(400).json({ success: false, message: "Invalid JSON" }); }
  const notes = entityNotes(event.payload);
  const tenantId = String(notes.tenantId || "");
  const appointmentId = String(notes.appointmentId || "");
  if (!tenantId || !appointmentId)
    return res.status(400).json({ success: false, message: "Missing CareFlow payment reference" });
  const integration = await prisma.razorpayIntegration.findUnique({ where: { tenantId } });
  if (!integration?.isActive || !integration.webhookSecretEncrypted)
    return res.status(401).json({ success: false, message: "Webhook is not configured for this clinic" });
  const signature = String(req.headers["x-razorpay-signature"] || "");
  const secret = decryptIntegrationSecret(integration.webhookSecretEncrypted);
  if (!verifyRazorpaySignature(rawBody, signature, secret))
    return res.status(401).json({ success: false, message: "Invalid webhook signature" });
  const externalId = String(req.headers["x-razorpay-event-id"] || event.id || `${event.event}:${event.created_at}:${appointmentId}`);
  const duplicate = await prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: "RAZORPAY", externalId } } });
  if (duplicate?.processedAt) return res.json({ success: true, duplicate: true });
  const webhook = duplicate || await prisma.webhookEvent.create({ data: { provider: "RAZORPAY", externalId, payload: event } });
  if (["payment_link.paid", "payment.captured"].includes(event.event)) {
    const paymentId = event.payload?.payment?.entity?.id;
    await confirmRazorpayAppointment(appointmentId, paymentId);
  } else if (event.event === "payment.failed") {
    await prisma.payment.updateMany({ where: { appointmentId, tenantId, provider: "RAZORPAY_PAYMENT_LINK" }, data: { status: "FAILED", providerPaymentId: event.payload?.payment?.entity?.id || null } });
    await prisma.auditLog.create({ data: { tenantId, action: "appointment.payment.razorpay_failed", entityType: "Appointment", entityId: appointmentId, metadata: { reason: event.payload?.payment?.entity?.error_description || "Payment failed" } } });
  }
  await prisma.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
  return res.json({ success: true });
}));
