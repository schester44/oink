import type { IncomingMessage } from "http";
import { logger } from "../lib/logger.js";

export interface Context {
  logger: typeof logger;
}

export function createContext(_req: IncomingMessage): Context {
  return {
    logger,
  };
}
