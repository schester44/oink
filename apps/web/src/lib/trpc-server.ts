import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@pinky/trpc";

// Server-side tRPC client that calls the gateway directly
const GATEWAY_TRPC_URL =
  process.env.GATEWAY_TRPC_URL || "http://localhost:4446/trpc";

export const trpcServer = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: GATEWAY_TRPC_URL,
      transformer: superjson,
    }),
  ],
});
