import { createServerFn } from "@tanstack/react-start";
import { trpcServer } from "./trpc-server";

export type { HealthStatus } from "@pinky/trpc";

export const getHealthServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      return await trpcServer.health.check.query();
    } catch {
      return {
        status: "error" as const,
        version: "unknown",
        uptime: 0,
        timestamp: new Date().toISOString(),
      };
    }
  },
);
