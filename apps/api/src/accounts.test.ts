import { describe, expect, it } from "vitest";
import { financials } from "./accounts.js";
const base = { amount: 1000, status: "CONFIRMED", paymentStatus: "PENDING" };
describe("appointment accounts", () => {
  it("does not count pending or failed payment attempts as collections", () => {
    expect(financials({ ...base, payments: [{ amount: 1000, status: "FAILED" }, { amount: 1000, status: "PENDING" }] })).toMatchObject({ collected: 0, outstanding: 1000 });
  });
  it("adds recorded partial payments and rounds commission", () => {
    expect(financials({ ...base, paymentStatus: "PARTIALLY_PAID", payments: [{ amount: 200, status: "PARTIALLY_PAID" }, { amount: 300, status: "PAID" }], commissionType: "PERCENTAGE", commissionValue: 12.55 })).toMatchObject({ collected: 500, outstanding: 500, estimatedCommission: 125.5 });
  });
  it("keeps missing partial collection unknown", () => {
    expect(financials({ ...base, paymentStatus: "PARTIALLY_PAID" })).toMatchObject({ collected: null, netCollected: null, outstanding: null });
  });
  it("retains cancelled collections without claiming outstanding or commission", () => {
    expect(financials({ ...base, status: "CANCELLED", paymentStatus: "PAID", commissionValue: 100 })).toMatchObject({ netCollected: 1000, outstanding: 0, estimatedCommission: 0 });
  });
  it("reports refunds separately", () => {
    expect(financials({ ...base, paymentStatus: "REFUNDED", payments: [{ amount: 1000, status: "REFUNDED" }] })).toMatchObject({ collected: 1000, refunded: 1000, netCollected: 0, outstanding: 0 });
  });
  it("preserves zero subtotal and discounts", () => {
    expect(financials({ ...base, amount: 0, subtotal: 500, discount: 500 })).toMatchObject({ gross: 500, discount: 500, charge: 0 });
  });
  it("uses paid status when no transaction exists and flags overcollections", () => {
    expect(financials({ ...base, paymentStatus: "PAID" }).collected).toBe(1000);
    expect(financials({ ...base, payments: [{ amount: 1200, status: "PAID" }] }).note).toContain("exceed");
  });
});
