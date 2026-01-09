import handler, { type ServerEntry } from "@tanstack/react-start/server-entry";
import { initializeBrain } from "./lib/init-brain";
import { logger } from "./lib/logger";

initializeBrain();
logger.info("Gateway server starting");

export default {
  fetch(request) {
    return handler.fetch(request);
  },
} satisfies ServerEntry;
