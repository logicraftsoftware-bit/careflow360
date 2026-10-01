import { prisma } from "./lib.js";
import { ERP_SYNC_INTERVAL_MS, sanitizeErpError, syncClinicToErp } from "./erp-sync.js";

export function startErpSyncScheduler() {
  let stopped = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function syncDueClinics() {
    try {
      const integrations = await prisma.erpOutboundIntegration.findMany({
        where: {
          isActive: true,
          tenant: { status: { in: ["ACTIVE", "TRIAL"] }, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          OR: [{ lastSyncStartedAt: null }, { lastSyncStartedAt: { isSet: false } }, { lastSyncStartedAt: { lte: new Date(Date.now() - ERP_SYNC_INTERVAL_MS) } }],
        },
        select: { tenantId: true },
      });
      await Promise.all(integrations.map(async ({ tenantId }) => {
        if (stopped) return;
        try {
          await syncClinicToErp(tenantId, true);
        } catch (error) {
          console.error("Automatic ERP sync failed", { tenantId, error: sanitizeErpError(error) });
        }
      }));
    } catch (error) {
      console.error("ERP scheduler failed", sanitizeErpError(error));
    }
  }
  function tick() {
    if (stopped || running) return;
    running = syncDueClinics().finally(() => {
      running = undefined;
      if (!stopped) {
        timer = setTimeout(tick, ERP_SYNC_INTERVAL_MS);
      }
    });
  }
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
