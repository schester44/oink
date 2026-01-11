import { logger } from "./lib/logger.js";
import {
  startScheduler,
  stopScheduler,
  getSchedulerStats,
} from "./tasks/scheduler.js";
import { startTRPCServer, stopTRPCServer } from "./trpc/server.js";
import { pluginRegistry, startChatHandler, stopChatHandler } from "./plugins/index.js";

async function startGateway() {
  logger.info("Starting Pinky Gateway");

  // Start chat handler (bridges event bus to LLM)
  startChatHandler();

  // Load and start plugins
  await pluginRegistry.loadFromConfig();
  await pluginRegistry.startAll();

  await startTRPCServer();

  await startScheduler({
    defaultInstanceId: "default",
  });

  setInterval(() => {
    const schedulerStats = getSchedulerStats();
    logger.debug(
      { scheduler: schedulerStats },
      "Gateway stats",
    );
  }, 60000);

  logger.info("Pinky Gateway started successfully");
}

async function shutdown() {
  logger.info("Shutting down gateway");

  await stopScheduler();
  await pluginRegistry.stopAll();
  stopChatHandler();
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
