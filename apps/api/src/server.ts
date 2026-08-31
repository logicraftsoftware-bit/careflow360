import { app } from './app.js'; import { config } from './config.js'; import { prisma } from './lib.js';
const server=app.listen(config.PORT,()=>console.log(`CareFlow360 API listening on ${config.PORT}`));const stop=async()=>{server.close();await prisma.$disconnect()};process.on('SIGTERM',stop);process.on('SIGINT',stop);
