import { logger } from "./lib/logger.js";
import {
  startScheduler,
  stopScheduler,
  getSchedulerStats,
} from "./tasks/scheduler.js";
import { startTRPCServer, stopTRPCServer } from "./trpc/server.js";
import {
  pluginRegistry,
  startChatHandler,
  stopChatHandler,
} from "./plugins/index.js";
import { disposeAllSessions } from "./agent/agent-service.js";

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
    logger.debug({ scheduler: schedulerStats }, "Gateway stats");
  }, 60000);

  logger.info("Pinky Gateway started successfully");
}

let isShuttingDown = false;

async function shutdown() {
  console.log("SHUTDOWN INITIATED");
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    logger.debug("Shutdown already in progress");

    return;
  }
  isShuttingDown = true;

  logger.info("Shutting down gateway");

  // Set a timeout to force exit if shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    logger.warn("Shutdown timeout - forcing exit");
    process.exit(1);
  }, 5000);

  try {
    await stopScheduler();
    await pluginRegistry.stopAll();
    stopChatHandler();
    disposeAllSessions();
    await stopTRPCServer();

    clearTimeout(forceExitTimeout);
    logger.info("Gateway shutdown complete");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimeout);
    logger.error({ error }, "Error during shutdown");
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

// tsx watch sends SIGUSR2 before restart
process.on("SIGUSR2", async () => {
  logger.info("Received SIGUSR2 (tsx watch restart)");
  await shutdown();
});

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
