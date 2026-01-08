import { logger } from "./lib/logger";

async function startGateway() {
  logger.info({ msg: "Starting gateway..." });

  try {
    // TODO: Add cron jobs, heartbeats, etc.

    process.on("uncaughtException", async (error) => {
      logger.error({ msg: "Uncaught Exception", error });
      process.exit(1);
    });

    process.on("unhandledRejection", async (reason) => {
      logger.error({ msg: "Unhandled Rejection", reason });
      process.exit(1);
    });

    process.on("SIGTERM", async () => {
      logger.info({ msg: "Received SIGTERM, shutting down gracefully..." });
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info({ msg: "Received SIGINT, shutting down gracefully..." });
      process.exit(0);
    });

    logger.info({ msg: "Gateway started successfully." });

    // Keep the process alive
    await new Promise(() => {});
  } catch (error) {
    logger.error({ msg: "Error starting gateway", error });
    process.exit(1);
  }
}

startGateway().catch((error) => {
  logger.error({ msg: "Fatal error starting gateway", error });
  process.exit(1);
});
