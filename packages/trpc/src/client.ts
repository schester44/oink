import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./router";

export interface CreateClientOptions {
  url: string;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

export function createClient(options: CreateClientOptions) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: options.url,
        transformer: superjson,
        headers: options.headers,
      }),
    ],
  });
}

export type TRPCClient = ReturnType<typeof createClient>;
