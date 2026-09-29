import { AppError } from "./lib.js";
const money = (n: number) => Math.round(n * 100) / 100;
export function diagnosticPayment(data: Record<string, any>) {
  const total = money(Number(data.amount));
  const collected = money(Number(data.collectedAmount ?? 0));
  const link = data.paymentMethod === "WHATSAPP_LINK";
  const requested = money(Number(data.paymentLinkAmount ?? 0));
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(collected) || collected < 0 || collected > total)
    throw new AppError(400, "Invalid payment amount", "INVALID_PAYMENT_AMOUNT");
  if (link && (collected !== 0 || !Number.isFinite(requested) || requested <= 0 || requested > total))
    throw new AppError(400, "Payment link amount must be greater than zero and no more than the total", "INVALID_PAYMENT_AMOUNT");
  if (collected > 0 && !["CASH", "CARD", "UPI", "BANK_TRANSFER"].includes(data.paymentMethod))
    throw new AppError(400, "Select a payment method", "INVALID_PAYMENT_METHOD");
  return { collectedAmount: collected, remainingAmount: money(total - collected),
    paymentStatus: collected === 0 ? "PENDING" : collected < total ? "PARTIALLY_PAID" : "PAID",
    ...(link ? { paymentLinkAmount: requested } : {}), sendWhatsApp: link };
}
export function diagnosticSettlement(total: number, collected: number, paid: number) {
  if (!Number.isFinite(paid) || paid <= 0 || money(collected + paid) > money(total)) throw new Error("Invalid confirmed payment amount");
  const collectedAmount = money(collected + paid), remainingAmount = money(total - collectedAmount);
  return { collectedAmount, remainingAmount, paymentStatus: remainingAmount > 0 ? "PARTIALLY_PAID" : "PAID" };
}
