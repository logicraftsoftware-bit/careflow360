import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patient: vi.fn(), clinic: vi.fn(), audit: vi.fn(), link: vi.fn(), send: vi.fn() }));
vi.mock("./lib.js", () => ({ prisma: { patient: { findFirst: mocks.patient }, tenant: { findUnique: mocks.clinic } }, audit: mocks.audit, AppError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("./aisensy.js", () => ({ sendDiagnosticMessage: mocks.send }));
vi.mock("./cashfree.js", () => ({ ensureDiagnosticPaymentLink: mocks.link }));
import { notifyDiagnostic } from "./diagnostic-notification.js";
const req = {} as Parameters<typeof notifyDiagnostic>[0];
const row = { id: "order-1", tenantId: "tenant-1", title: "LAB-1", module: "lab-appointments", status: "ASSIGNED", data: { patientId: "patient-1", sendWhatsApp: true, paymentStatus: "PENDING", appointmentAt: "2026-09-30T04:00:00Z", amount: 150 } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.patient.mockResolvedValue({ name: "Patient", mobile: "9999999999", patientNumber: "PT-1" });
  mocks.clinic.mockResolvedValue({ name: "Clinic", mobile: "8888888888" });
  mocks.link.mockResolvedValue({ short_url: "https://payments.example/link" });
  mocks.send.mockResolvedValue({ sent: true });
});
describe("diagnostic booking WhatsApp", () => {
  it("sends even when creating the payment link fails", async () => {
    mocks.link.mockRejectedValue(new Error("Cashfree not configured"));
    expect(await notifyDiagnostic(req, row)).toEqual({ sent: true });
    expect(mocks.send).toHaveBeenCalledWith("payment_pending", expect.anything(), expect.objectContaining({ paymentUrl: "Please contact Clinic at 8888888888 for payment." }));
    expect(mocks.audit).toHaveBeenCalledWith(req, "lab-appointments.payment_link.failed", "ModuleRecord", "order-1", expect.anything());
  });
  it("includes a payment link when it is available", async () => {
    await notifyDiagnostic(req, row);
    expect(mocks.send).toHaveBeenCalledWith("payment_pending", expect.anything(), expect.objectContaining({ paymentUrl: "https://payments.example/link" }));
  });
  it("returns skipped delivery so booking can display the reason", async () => {
    mocks.send.mockResolvedValue({ sent: false, reason: "AiSensy is not configured for this clinic" });
    expect(await notifyDiagnostic(req, row)).toMatchObject({ sent: false, reason: "AiSensy is not configured for this clinic" });
  });
  it("returns messaging failure without failing a successful booking", async () => {
    mocks.send.mockRejectedValue(new Error("Provider unavailable"));
    expect(await notifyDiagnostic(req, row)).toMatchObject({ sent: false });
    await expect(notifyDiagnostic(req, row, undefined, true)).rejects.toMatchObject({ status: 502 });
  });
  it("honors the unchecked WhatsApp option", async () => {
    await notifyDiagnostic(req, { ...row, data: { ...row.data, sendWhatsApp: false } });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("sends paid confirmations without requesting a payment link", async () => {
    await notifyDiagnostic(req, { ...row, data: { ...row.data, paymentStatus: "PAID" } });
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith("payment_success", expect.anything(), expect.anything());
  });
});
