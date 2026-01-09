// Types that can be safely imported by frontend code

export interface MetricsData {
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgInputTokensPerRequest: number;
  avgOutputTokensPerRequest: number;
  avgTokensPerRequest: number;
  lastUpdated: string;
  histogram: {
    inputTokens: number[];
    outputTokens: number[];
    totalTokens: number[];
  };
}
