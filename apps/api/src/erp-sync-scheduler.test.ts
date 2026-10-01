import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), sync: vi.fn() }));
vi.mock("./lib.js", () => ({ prisma: { erpOutboundIntegration: { findMany: mocks.findMany } } }));
vi.mock("./erp-sync.js", () => ({ ERP_SYNC_INTERVAL_MS: 300_000, syncClinicToErp: mocks.sync, sanitizeErpError: () => "Sync failed" }));
import { startErpSyncScheduler } from "./erp-sync-scheduler.js";

describe("automatic ERP synchronization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ tenantId: "clinic-1" }]);
    mocks.sync.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("runs on startup and every five minutes, and stops cleanly", async () => {
    const stop = startErpSyncScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.sync).toHaveBeenCalledWith("clinic-1", true);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({ isActive: true, tenant: { status: { in: ["ACTIVE", "TRIAL"] } } });
    await vi.advanceTimersByTimeAsync(299_999);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    await stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("does not overlap a running batch and waits for it on shutdown", async () => {
    let finish!: () => void;
    mocks.sync.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const stop = startErpSyncScheduler();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("continues syncing other clinics after a failure and retries next tick", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findMany.mockResolvedValue([{ tenantId: "clinic-1" }, { tenantId: "clinic-2" }]);
    mocks.sync.mockRejectedValueOnce(new Error("unavailable"));
    const stop = startErpSyncScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.sync).toHaveBeenCalledWith("clinic-2", true);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mocks.sync).toHaveBeenCalledTimes(4);
    await stop();
  });
});
