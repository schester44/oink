import { logger } from "./lib/logger.js";
import {
  startScheduler,
  stopScheduler,
  getSchedulerStats,
} from "./tasks/scheduler.js";
import {
  startWebSocketServer,
  stopWebSocketServer,
  getWebSocketStats,
} from "./websocket.js";
import { startTRPCServer, stopTRPCServer } from "./trpc/server.js";

async function startGateway() {
  logger.info("Starting Oink Gateway");

  await startWebSocketServer();
  await startTRPCServer();

  await startScheduler({
    defaultInstanceId: "default",
  });

  setInterval(() => {
    const schedulerStats = getSchedulerStats();
    const wsStats = getWebSocketStats();
    logger.debug(
      { scheduler: schedulerStats, websocket: wsStats },
      "Gateway stats",
    );
  }, 60000);

  logger.info("Oink Gateway started successfully");
}

async function shutdown() {
  logger.info("Shutting down gateway");

  await stopScheduler();
  await stopWebSocketServer();
  await stopTRPCServer();

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
