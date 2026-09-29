import { Router } from "express";
import { z } from "zod";
import { prisma, tenantId, asyncRoute, ok, AppError, audit } from "../lib.js";
import { paymentReceipt, receivedAmount } from "../diagnostic-receipts.js";
export const diagnosticDocumentsRouter = Router();
diagnosticDocumentsRouter.get("/diagnostic-appointments/:id/documents", asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  const record = await prisma.moduleRecord.findFirst({ where: { id: req.params.id, tenantId: tid, module: { in: ["lab-appointments", "radiology-appointments"] } } });
  if (!record) throw new AppError(404, "Appointment not found", "NOT_FOUND");
  const data = record.data as any;
  const [patient, clinic] = await Promise.all([
    prisma.patient.findFirst({ where: { id: data.patientId, tenantId: tid }, select: { name: true, patientNumber: true, mobile: true, gender: true, age: true, address: true } }),
    prisma.tenant.findUnique({ where: { id: tid }, select: { name: true, mobile: true, address: true, logoUrl: true } }),
  ]);
  const received = receivedAmount(data);
  return ok(res, { ...data, id: record.id, title: record.title, createdAt: record.createdAt, status: record.status, kind: record.module === "lab-appointments" ? "Lab" : "Radiology", patient, clinic,
    tokenNumber: data.tokenNumber || record.title, collectedAmount: received, remainingAmount: received === null ? null : Math.max(0, Number(data.amount || 0) - received), receipts: data.receipts || [] });
}));
diagnosticDocumentsRouter.post("/diagnostic-appointments/:id/payments", asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  const body = z.object({ amount: z.coerce.number().positive(), method: z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER"]), reference: z.string().max(150).default(""), requestId: z.string().uuid() }).parse(req.body);
  const record = await prisma.moduleRecord.findFirst({ where: { id: req.params.id, tenantId: tid, module: { in: ["lab-appointments", "radiology-appointments"] } } });
  if (!record) throw new AppError(404, "Appointment not found", "NOT_FOUND");
  const data = record.data as any;
  if (["CANCELLED", "REFUNDED"].includes(record.status) || data.paymentStatus === "REFUNDED") throw new AppError(409, "Cannot collect payment for a cancelled or refunded appointment", "INVALID_STATUS");
  if ((data.receipts || []).some((r: any) => r.source === body.requestId)) return ok(res, record);
  const payment = paymentReceipt(data, body.amount, body.method, body.requestId, body.reference, req.user!.id);
  const result = await prisma.moduleRecord.updateMany({ where: { id: record.id, tenantId: tid, updatedAt: record.updatedAt }, data: { data: { ...data, ...payment, paymentCollectedById: req.user!.id } } });
  if (result.count !== 1) throw new AppError(409, "Another payment changed this appointment. Refresh and try again.", "PAYMENT_CONFLICT");
  await audit(req, "diagnostic.payment.received", "ModuleRecord", record.id, { amount: body.amount, method: body.method, receipt: payment.receipts.at(-1)?.number });
  return ok(res, payment, "Payment recorded and receipt generated");
}));
