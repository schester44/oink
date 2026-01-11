// Types that can be safely imported by frontend code

export interface MetricsData {
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgInputTokensPerRequest: number;
  avgOutputTokensPerRequest: number;
  avgTokensPerRequest: number;
  // Cache stats (Anthropic prompt caching)
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  cacheHitRate: number; // Percentage of requests with cache hits
  lastUpdated: string;
  histogram: {
    inputTokens: number[];
    outputTokens: number[];
    totalTokens: number[];
  };
}
