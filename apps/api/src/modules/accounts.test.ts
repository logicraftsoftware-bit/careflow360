import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findFirst: vi.fn() }, moduleRecord: { findMany: vi.fn() }, tenant: { findUniqueOrThrow: vi.fn() }, appointment: { findMany: vi.fn() }, patient: { findMany: vi.fn() } }));
vi.mock("../lib.js", () => ({
  prisma: db,
  AppError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  auth: (req: any, _res: any, next: any) => { req.user = { id: "user-a", tenantId: "tenant-a" }; next(); },
  tenantId: (req: any) => req.user.tenantId,
  asyncRoute: (handler: any) => (req: any, res: any, next: any) => Promise.resolve(handler(req, res)).catch(next),
  ok: (res: any, data: any) => res.json({ data }),
}));
import { accountsRouter } from "./accounts.js";
let server: Server;
async function request(kind: string) {
  const app = express(); app.use("/accounts", accountsRouter);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 400).json({ message: err.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return fetch(`http://127.0.0.1:${(server.address() as any).port}/accounts/${kind}`);
}
beforeEach(() => {
  vi.resetAllMocks();
  db.moduleRecord.findMany.mockResolvedValue([]);
  db.tenant.findUniqueOrThrow.mockResolvedValue({ currency: "INR", timezone: "Asia/Kolkata" });
  db.appointment.findMany.mockResolvedValue([]);
  db.patient.findMany.mockResolvedValue([]);
});
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });
describe("accounts access and tenant isolation", () => {
  it("rejects staff without accounts permission before fetching appointments", async () => {
    db.user.findFirst.mockResolvedValue({ roles: [{ role: { code: "STAFF", permissions: [] } }] });
    expect((await request("doctor")).status).toBe(403);
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });
  it("honors configured permission revocation", async () => {
    db.user.findFirst.mockResolvedValue({ roles: [{ role: { code: "STAFF", permissions: [{ permission: { key: "accounts.read" } }] } }] });
    db.moduleRecord.findMany.mockResolvedValue([{ data: { code: "STAFF", permissions: [] } }]);
    expect((await request("doctor")).status).toBe(403);
  });
  it("allows accounts readers and scopes appointment and payment queries to their tenant", async () => {
    db.user.findFirst.mockResolvedValue({ roles: [{ role: { code: "ACCOUNTANT", permissions: [{ permission: { key: "accounts.read" } }] } }] });
    expect((await request("doctor")).status).toBe(200);
    expect(db.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-a" }, include: expect.objectContaining({ payments: { where: { tenantId: "tenant-a" } } }) }));
  });
  it("keeps diagnostic partial amounts unknown and queries only tenant records", async () => {
    db.user.findFirst.mockResolvedValue({ roles: [{ role: { code: "CLINIC_ADMIN", permissions: [] } }] });
    db.moduleRecord.findMany.mockImplementation(({ where }) => Promise.resolve(where.module === "lab-appointments" ? [{ id: "lab-1", title: "LAB-1", status: "CONFIRMED", createdAt: new Date(), data: { amount: 800, subtotal: 1000, discountAmount: 200, paymentStatus: "PARTIALLY_PAID", testNames: "CBC" } }] : []));
    const response = await request("lab"), body = await response.json();
    expect(body.data.items[0]).toMatchObject({ gross: 1000, discount: 200, charge: 800, collected: null, outstanding: null });
    for (const [query] of db.moduleRecord.findMany.mock.calls) expect(query.where.tenantId).toBe("tenant-a");
  });
});
