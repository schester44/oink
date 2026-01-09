import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@oink/trpc";

// Client-side tRPC client that calls the web app's proxy endpoint
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
});

// Re-export types for convenience
export type { AppRouter } from "@oink/trpc";
export type {
  Instance,
  SessionInfo,
  MetricsData,
  HealthStatus,
} from "@oink/trpc";
