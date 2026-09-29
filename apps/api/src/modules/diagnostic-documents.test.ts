import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ moduleRecord: { findFirst: vi.fn(), updateMany: vi.fn() }, patient: { findFirst: vi.fn() }, tenant: { findUnique: vi.fn() } }));
vi.mock("../lib.js", () => ({ prisma: db, audit: vi.fn(), tenantId: () => "tenant-a", AppError: class extends Error { constructor(public status: number, message: string) { super(message); } }, asyncRoute: (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next), ok: (res: any, data: any) => res.json({ data }) }));
import { diagnosticDocumentsRouter } from "./diagnostic-documents.js";
let server: Server;
const requestId = "ba33af8b-adf6-442f-a567-7c45c62ac32b";
const record = { id: "order-a", tenantId: "tenant-a", module: "lab-appointments", title: "LAB-A", updatedAt: new Date(), status: "ASSIGNED", data: { patientId: "patient-a", amount: 150, collectedAmount: 50, receipts: [] } };
async function request(method = "GET", body?: any) {
  const app = express(); app.use(express.json()); app.use((req: any, _res, next) => { req.user = { id: "staff-a" }; next(); }); app.use(diagnosticDocumentsRouter);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 500).json({ message: err.message }));
  server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  return fetch(`http://127.0.0.1:${(server.address() as any).port}/diagnostic-appointments/order-a/${method === "GET" ? "documents" : "payments"}`, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => { vi.resetAllMocks(); db.moduleRecord.findFirst.mockResolvedValue(record); db.moduleRecord.updateMany.mockResolvedValue({ count: 1 }); db.patient.findFirst.mockResolvedValue({ name: "Patient" }); db.tenant.findUnique.mockResolvedValue({ name: "Clinic" }); });
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });
describe("diagnostic document and receipt endpoints", () => {
  it("scopes documents and patient details to the current tenant", async () => {
    expect((await request()).status).toBe(200);
    expect(db.moduleRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a", id: "order-a" }) }));
    expect(db.patient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "patient-a", tenantId: "tenant-a" } }));
  });
  it("rejects missing or other-tenant appointments", async () => { db.moduleRecord.findFirst.mockResolvedValue(null); expect((await request()).status).toBe(404); });
  it("records the payment and receipt together with a concurrency check", async () => {
    expect((await request("POST", { amount: 25, method: "CASH", requestId })).status).toBe(200);
    const args = db.moduleRecord.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: "tenant-a", updatedAt: record.updatedAt });
    expect(args.data.data).toMatchObject({ collectedAmount: 75, remainingAmount: 75 });
    expect(args.data.data.receipts[0]).toMatchObject({ amount: 25, source: requestId });
  });
  it("does not repeat a payment after a retried request", async () => {
    db.moduleRecord.findFirst.mockResolvedValue({ ...record, data: { ...record.data, receipts: [{ source: requestId }] } });
    expect((await request("POST", { amount: 25, method: "CASH", requestId })).status).toBe(200);
    expect(db.moduleRecord.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a concurrent modification", async () => {
    db.moduleRecord.updateMany.mockResolvedValue({ count: 0 });
    expect((await request("POST", { amount: 25, method: "CASH", requestId })).status).toBe(409);
  });
});
