import { describe, expect, it, vi } from "vitest";
vi.mock("./lib.js", () => ({ AppError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { diagnosticPayment, diagnosticSettlement } from "./diagnostic-payment.js";
describe("diagnostic payment amounts", () => {
  it("records partial cash payment and its remaining balance", () => {
    expect(diagnosticPayment({ amount: 150, collectedAmount: 100, paymentMethod: "CASH" })).toMatchObject({ collectedAmount: 100, remainingAmount: 50, paymentStatus: "PARTIALLY_PAID", sendWhatsApp: false });
  });
  it("marks full card payment paid without requiring a reference", () => {
    expect(diagnosticPayment({ amount: 150, collectedAmount: 150, paymentMethod: "CARD" })).toMatchObject({ paymentStatus: "PAID", remainingAmount: 0 });
  });
  it("keeps a WhatsApp request pending without treating it as collected", () => {
    expect(diagnosticPayment({ amount: 150, collectedAmount: 0, paymentLinkAmount: 100, paymentMethod: "WHATSAPP_LINK", paymentStatus: "PAID" })).toMatchObject({ paymentStatus: "PENDING", remainingAmount: 150, collectedAmount: 0, paymentLinkAmount: 100, sendWhatsApp: true });
  });
  it("rejects overpayment and invalid link amounts", () => {
    expect(() => diagnosticPayment({ amount: 150, collectedAmount: 151, paymentMethod: "CASH" })).toThrow();
    for (const paymentLinkAmount of [0, -1, 151, NaN]) expect(() => diagnosticPayment({ amount: 150, collectedAmount: 0, paymentLinkAmount, paymentMethod: "WHATSAPP_LINK" })).toThrow();
  });
  it("requires an offline method for collected payments", () => {
    expect(() => diagnosticPayment({ amount: 150, collectedAmount: 50 })).toThrow();
  });
  it("marks only the amount actually confirmed by the gateway as paid", () => {
    expect(diagnosticSettlement(150, 0, 100)).toEqual({ collectedAmount: 100, remainingAmount: 50, paymentStatus: "PARTIALLY_PAID" });
    expect(diagnosticSettlement(150, 100, 50)).toEqual({ collectedAmount: 150, remainingAmount: 0, paymentStatus: "PAID" });
  });
  it("uses currency precision and rejects invalid gateway amounts", () => {
    expect(diagnosticSettlement(1, 0.1, 0.2)).toMatchObject({ collectedAmount: 0.3, remainingAmount: 0.7 });
    expect(() => diagnosticSettlement(150, 100, 100)).toThrow();
    expect(() => diagnosticSettlement(150, 0, NaN)).toThrow();
  });
});
