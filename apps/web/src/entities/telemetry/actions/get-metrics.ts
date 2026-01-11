import { createServerFn } from "@tanstack/react-start";
import { trpcServer } from "@/lib/trpc-server";

export const getMetricsServerFn = createServerFn().handler(async () => {
  try {
    return await trpcServer.metrics.get.query();
  } catch {
    // Gateway not available, return default metrics
    return {
      requestCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      avgInputTokensPerRequest: 0,
      avgOutputTokensPerRequest: 0,
      avgTokensPerRequest: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      cacheHitRate: 0,
      lastUpdated: new Date().toISOString(),
      histogram: {
        inputTokens: [],
        outputTokens: [],
        totalTokens: [],
      },
    };
  }
});
