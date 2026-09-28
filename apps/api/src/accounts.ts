export const money = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
type Payment = { amount: number; status: string; provider?: string };
export function financials(input: { amount: number; subtotal?: number; discount?: number; status: string; paymentStatus: string; payments?: Payment[]; commissionType?: string; commissionValue?: number }) {
  const charge = money(input.amount), cancelled = input.status === "CANCELLED";
  const payments = input.payments || [];
  const settled = payments.filter((p) => ["PAID", "PARTIALLY_PAID", "REFUNDED"].includes(p.status));
  const unknown = input.paymentStatus === "PARTIALLY_PAID" && !settled.length;
  const collected = unknown ? null : settled.length
    ? money(settled.reduce((sum, p) => sum + p.amount, 0))
    : ["PAID", "REFUNDED"].includes(input.paymentStatus) ? charge : 0;
  const refunded = money(payments.some((p) => p.status === "REFUNDED")
    ? payments.filter((p) => p.status === "REFUNDED").reduce((sum, p) => sum + p.amount, 0)
    : input.paymentStatus === "REFUNDED" ? charge : 0);
  const netCollected = collected === null ? null : money(collected - refunded);
  const billable = cancelled || ["NOT_REQUIRED", "REFUNDED"].includes(input.paymentStatus) ? 0 : charge;
  const outstanding = netCollected === null ? null : money(Math.max(0, billable - netCollected));
  const estimatedCommission = billable === 0 ? 0 : money(input.commissionType === "PERCENTAGE"
    ? billable * (input.commissionValue || 0) / 100 : input.commissionValue || 0);
  return { gross: money(input.subtotal ?? charge), discount: money(input.discount ?? 0), charge, billable, collected, refunded, netCollected, outstanding, estimatedCommission,
    note: unknown ? "Partial payment amount is not recorded" : netCollected !== null && netCollected > charge ? "Collections exceed the appointment charge; review payment records" : cancelled && (netCollected || 0) > 0 ? "Cancelled appointment retains a collection; review refund" : "" };
}
