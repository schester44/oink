import handler, { type ServerEntry } from "@tanstack/react-start/server-entry";
import { logger } from "./lib/logger";

logger.info("Gateway server starting");

export default {
  fetch(request) {
    return handler.fetch(request);
  },
} satisfies ServerEntry;
