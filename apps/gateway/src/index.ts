// apps/gateway/src/index.ts

import { logger } from "./lib/logger.js";
import { startScheduler, stopScheduler, getSchedulerStats } from "./lib/tasks/scheduler.js";
import { startWebSocketServer, stopWebSocketServer, getWebSocketStats } from "./lib/websocket.js";

async function startGateway() {
  logger.info("Starting Oink Gateway");

  // Start WebSocket server
  await startWebSocketServer();

  // Start scheduler
  await startScheduler();

  // Log stats periodically
  setInterval(() => {
    const schedulerStats = getSchedulerStats();
    const wsStats = getWebSocketStats();
    logger.debug({ scheduler: schedulerStats, websocket: wsStats }, "Gateway stats");
  }, 60000);

  logger.info("Oink Gateway started successfully");
}

async function shutdown() {
  logger.info("Shutting down gateway");

  await stopScheduler();
  await stopWebSocketServer();

  logger.info("Gateway shutdown complete");
  process.exit(0);
}

// Graceful shutdown handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Global error handlers
process.on("uncaughtException", (error) => {
  logger.error({ error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  process.exit(1);
});

// Start the gateway
startGateway().catch((error) => {
  logger.error({ error }, "Failed to start gateway");
  process.exit(1);
});
