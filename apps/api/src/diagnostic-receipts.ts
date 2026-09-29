import { randomUUID } from "node:crypto";
import { AppError } from "./lib.js";
const money = (value: unknown) => Math.round(Number(value) * 100) / 100;
export function receivedAmount(data: any): number | null {
  if (data.collectedAmount != null) return money(data.collectedAmount);
  return data.paymentStatus === "PARTIALLY_PAID" ? null : data.paymentStatus === "PAID" ? money(data.amount || 0) : 0;
}
export function paymentReceipt(data: any, paid: number, method: string, source: string, reference = "", actor = "") {
  const before = receivedAmount(data);
  if (before === null) throw new AppError(409, "The previous partial payment amount is unknown. Reconcile it before recording another payment.", "UNKNOWN_PAYMENT_AMOUNT");
  const total = money(data.amount || 0), amount = money(paid), collected = money(before + amount);
  if (!Number.isFinite(amount) || amount <= 0 || collected > total) throw new AppError(400, "Payment must be greater than zero and within the remaining balance", "INVALID_PAYMENT_AMOUNT");
  const receipt = { id: randomUUID(), number: `RCT-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, createdAt: new Date().toISOString(), amount, method, source, reference, actor,
    previousCollected: before, collectedAmount: collected, remainingAmount: money(total - collected), total,
    subtotal: Number(data.subtotal ?? total), discountAmount: Number(data.discountAmount || 0), tests: data.tests || [], testNames: data.testNames || "" };
  return { collectedAmount: collected, remainingAmount: receipt.remainingAmount, paymentStatus: receipt.remainingAmount > 0 ? "PARTIALLY_PAID" : "PAID",
    paymentMethod: method, paymentReference: reference, receipts: [...(data.receipts || []), receipt] };
}
export function initialDocuments(data: any, prefix = "LAB") {
  const amount = receivedAmount(data);
  return { tokenNumber: `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    ...(amount && amount > 0 ? paymentReceipt({ ...data, collectedAmount: 0, receipts: [] }, amount, data.paymentMethod || "UNRECORDED", "booking", data.paymentReference || "", data.paymentCollectedById || "") : { receipts: [] }) };
}

export function reconcileDocuments(previous: any, changes: any, source: string, actor: string) {
  const next = { ...previous, ...changes, receipts: previous.receipts || [], tokenNumber: previous.tokenNumber };
  const before = receivedAmount(previous);
  const after = changes.collectedAmount != null ? money(changes.collectedAmount) : changes.paymentStatus === "PAID" ? money(next.amount) : before;
  if (before !== null && after !== null && after > before) {
    return paymentReceipt({ ...next, collectedAmount: before }, money(after - before), changes.paymentMethod || previous.paymentMethod || "UNRECORDED", source, changes.paymentReference || "", actor);
  }
  if (before !== null && after !== null && after < before) throw new AppError(409, "Recorded payments cannot be reduced by editing the appointment", "PAYMENT_RECONCILIATION_REQUIRED");
  if (before !== null && before > Number(next.amount)) throw new AppError(409, "The total cannot be lower than payments already received", "INVALID_TOTAL");
  return { receipts: previous.receipts || [], ...(before === null ? {} : { collectedAmount: before, remainingAmount: money(Number(next.amount || 0) - before) }) };
}
