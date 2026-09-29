import { describe, expect, it, vi } from "vitest";
vi.mock("./lib.js", () => ({ AppError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { initialDocuments, paymentReceipt, receivedAmount, reconcileDocuments } from "./diagnostic-receipts.js";
describe("diagnostic receipts", () => {
  it("creates a token but no receipt for a pending link", () => {
    const docs = initialDocuments({ amount: 150, collectedAmount: 0, paymentStatus: "PENDING", paymentMethod: "WHATSAPP_LINK" });
    expect(docs.tokenNumber).toMatch(/^LAB-/); expect(docs.receipts).toEqual([]);
  });
  it("issues separate receipts and preserves the first partial payment balance", () => {
    const data = { amount: 150, subtotal: 200, discountAmount: 50, collectedAmount: 50, paymentStatus: "PARTIALLY_PAID", paymentMethod: "CASH", tests: [{ title: "Test", price: 200 }] };
    const initial = initialDocuments(data);
    expect(initial.receipts[0]).toMatchObject({ amount: 50, previousCollected: 0, remainingAmount: 100, total: 150 });
    const second = paymentReceipt({ ...data, ...initial }, 100, "CARD", "payment-2");
    expect(second.receipts).toHaveLength(2);
    expect(second.receipts[0].remainingAmount).toBe(100);
    expect(second.receipts[1]).toMatchObject({ amount: 100, previousCollected: 50, remainingAmount: 0 });
    expect(second.paymentStatus).toBe("PAID");
    expect(second.receipts[0].number).not.toBe(second.receipts[1].number);
  });
  it("rejects overpayment, zero, and unknown historic partial payments", () => {
    for (const amount of [0, -1, 151, NaN]) expect(() => paymentReceipt({ amount: 150, collectedAmount: 0 }, amount, "CASH", "test")).toThrow();
    expect(receivedAmount({ amount: 150, paymentStatus: "PARTIALLY_PAID" })).toBeNull();
    expect(() => paymentReceipt({ amount: 150, paymentStatus: "PARTIALLY_PAID" }, 10, "CASH", "test")).toThrow();
  });
  it("creates a receipt only for the additional amount when an existing partial booking is marked paid", () => {
    const change = reconcileDocuments({ amount: 150, collectedAmount: 50, receipts: [] }, { paymentStatus: "PAID", paymentMethod: "UPI" }, "edit", "user");
    expect(change.receipts[0].amount).toBe(100);
    expect(reconcileDocuments({ amount: 150, collectedAmount: 150, receipts: change.receipts }, { paymentStatus: "PAID" }, "repeat", "user").receipts).toHaveLength(1);
  });
  it("protects receipt history against editing", () => {
    const receipt = { number: "ORIGINAL" };
    expect(reconcileDocuments({ amount: 150, collectedAmount: 50, receipts: [receipt] }, { receipts: [] }, "edit", "user").receipts).toEqual([receipt]);
    expect(() => reconcileDocuments({ amount: 150, collectedAmount: 50 }, { collectedAmount: 0 }, "edit", "user")).toThrow();
  });
});
