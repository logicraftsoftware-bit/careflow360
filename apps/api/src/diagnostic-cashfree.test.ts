import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ moduleRecord: { findUnique: vi.fn(), update: vi.fn() }, patient: { findUnique: vi.fn() }, tenant: { findUnique: vi.fn() }, cashfreeIntegration: { findUnique: vi.fn() }, auditLog: { create: vi.fn() } }));
vi.mock("./lib.js", () => ({ prisma: db, AppError: class extends Error {} }));
vi.mock("./config.js", () => ({ config: { APP_URL: "https://crm.example" } }));
vi.mock("./aisensy.js", () => ({ decryptIntegrationSecret: () => "test-secret", sendDiagnosticMessage: vi.fn().mockResolvedValue({ sent: true }), appointmentToken: vi.fn(), sendPaymentSuccessMessage: vi.fn() }));
import { confirmCashfreeDiagnostic, ensureDiagnosticPaymentLink } from "./cashfree.js";
const row = { id: "order-1", tenantId: "clinic-1", module: "lab-appointments", title: "LAB-1", status: "ASSIGNED", data: { patientId: "patient-1", amount: 150, collectedAmount: 0, paymentLinkAmount: 100, paymentStatus: "PENDING", appointmentAt: "2026-09-30T04:00:00Z" } };
beforeEach(() => {
  vi.clearAllMocks(); db.moduleRecord.findUnique.mockResolvedValue(row); db.moduleRecord.update.mockResolvedValue(row);
  db.patient.findUnique.mockResolvedValue({ name: "Patient", mobile: "9999999999" });
  db.tenant.findUnique.mockResolvedValue({ name: "Clinic", mobile: "8888888888" });
});
afterEach(() => vi.unstubAllGlobals());
describe("diagnostic Cashfree amounts", () => {
  it("creates the link for the requested amount", async () => {
    db.cashfreeIntegration.findUnique.mockResolvedValue({ isActive: true, isTestMode: true, appId: "test", secretKeyEncrypted: "test" });
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ link_id: "link-1", link_url: "https://payments.example/1", cf_link_id: "cf-1" }) });
    vi.stubGlobal("fetch", fetch);
    await ensureDiagnosticPaymentLink(row, { name: "Patient", mobile: "9999999999" });
    expect(JSON.parse(fetch.mock.calls[0][1].body).link_amount).toBe(100);
  });
  it("persists a partial payment and balance from the confirmed amount", async () => {
    await confirmCashfreeDiagnostic("order-1", "payment-1", 100);
    expect(db.moduleRecord.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ data: expect.objectContaining({ collectedAmount: 100, remainingAmount: 50, paymentStatus: "PARTIALLY_PAID" }) }) }));
  });
  it("does not add the same confirmed payment twice", async () => {
    db.moduleRecord.findUnique.mockResolvedValue({ ...row, data: { ...row.data, providerPaymentId: "payment-1", collectedAmount: 100 } });
    await confirmCashfreeDiagnostic("order-1", "payment-1", 100);
    expect(db.moduleRecord.update).not.toHaveBeenCalled();
  });
});
