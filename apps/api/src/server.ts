import { app } from './app.js'; import { config } from './config.js'; import { prisma } from './lib.js';
import { startErpSyncScheduler } from './erp-sync-scheduler.js';
const server=app.listen(config.PORT,()=>console.log(`CareFlow360 API listening on ${config.PORT}`));
const stopErpSync = startErpSyncScheduler();
const stop=async()=>{server.close();await stopErpSync();await prisma.$disconnect()};process.on('SIGTERM',stop);process.on('SIGINT',stop);
