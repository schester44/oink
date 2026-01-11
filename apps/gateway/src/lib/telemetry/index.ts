import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import type { MetricsData } from "./types";

export type { MetricsData } from "./types";

// --- OpenTelemetry-compatible Types ---

export interface Attributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Counter {
  add(value: number, attributes?: Attributes): void;
}

export interface Histogram {
  record(value: number, attributes?: Attributes): void;
}

export interface Meter {
  createCounter(name: string, options?: { description?: string }): Counter;
  createHistogram(name: string, options?: { description?: string }): Histogram;
}

export interface MeterProvider {
  getMeter(name: string, version?: string): Meter;
}

// --- File-based Storage ---

function getRepoRoot(): string {
  try {
    const stdout = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
    });

    return stdout.trim();
  } catch {
    return process.cwd();
  }
}

function getMetricsPath(): string {
  const monorepoRoot = getRepoRoot();
  const metricsDir = join(monorepoRoot, "logs");

  if (!existsSync(metricsDir)) {
    mkdirSync(metricsDir, { recursive: true });
  }

  return join(metricsDir, "llm-metrics.json");
}

function loadMetrics(): MetricsData {
  const path = getMetricsPath();

  if (existsSync(path)) {
    try {
      const data = readFileSync(path, "utf8");

      return JSON.parse(data);
    } catch {
      // Corrupted file, start fresh
    }
  }

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

function saveMetrics(data: MetricsData): void {
  const path = getMetricsPath();
  data.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

// --- File-backed Meter Implementation ---

class FileBackedCounter implements Counter {
  constructor(private name: string) {}

  add(value: number, _attributes?: Attributes): void {
    const metrics = loadMetrics();

    if (this.name === "llm.requests") {
      metrics.requestCount += value;
    } else if (this.name === "llm.tokens.input") {
      metrics.totalInputTokens += value;
      metrics.totalTokens += value;
      metrics.histogram.inputTokens.push(value);
      // Keep last 1000 for histogram
      if (metrics.histogram.inputTokens.length > 1000) {
        metrics.histogram.inputTokens.shift();
      }
    } else if (this.name === "llm.tokens.output") {
      metrics.totalOutputTokens += value;
      metrics.totalTokens += value;
      metrics.histogram.outputTokens.push(value);
      if (metrics.histogram.outputTokens.length > 1000) {
        metrics.histogram.outputTokens.shift();
      }
    } else if (this.name === "llm.tokens.total") {
      // Already tracked via input + output, but can be used directly
      metrics.histogram.totalTokens.push(value);
      if (metrics.histogram.totalTokens.length > 1000) {
        metrics.histogram.totalTokens.shift();
      }
    }

    // Recalculate averages
    if (metrics.requestCount > 0) {
      metrics.avgInputTokensPerRequest =
        metrics.totalInputTokens / metrics.requestCount;

      metrics.avgOutputTokensPerRequest =
        metrics.totalOutputTokens / metrics.requestCount;

      metrics.avgTokensPerRequest = metrics.totalTokens / metrics.requestCount;
    }

    saveMetrics(metrics);
  }
}

class FileBackedHistogram implements Histogram {
  constructor(private name: string) {}

  record(value: number, _attributes?: Attributes): void {
    const metrics = loadMetrics();

    if (this.name === "llm.tokens.input.histogram") {
      metrics.histogram.inputTokens.push(value);
      if (metrics.histogram.inputTokens.length > 1000) {
        metrics.histogram.inputTokens.shift();
      }
    } else if (this.name === "llm.tokens.output.histogram") {
      metrics.histogram.outputTokens.push(value);
      if (metrics.histogram.outputTokens.length > 1000) {
        metrics.histogram.outputTokens.shift();
      }
    }

    saveMetrics(metrics);
  }
}

class FileBackedMeter implements Meter {
  name: string;

  constructor(_name: string) {
    this.name = _name;
  }

  createCounter(name: string, _options?: { description?: string }): Counter {
    return new FileBackedCounter(name);
  }

  createHistogram(
    name: string,
    _options?: { description?: string },
  ): Histogram {
    return new FileBackedHistogram(name);
  }
}

class FileBackedMeterProvider implements MeterProvider {
  getMeter(name: string, _version?: string): Meter {
    return new FileBackedMeter(name);
  }
}

// --- Singleton Instance ---

const meterProvider = new FileBackedMeterProvider();
const meter = meterProvider.getMeter("pinky-llm");

// Pre-created instruments for convenience
export const llmRequestCounter = meter.createCounter("llm.requests", {
  description: "Number of LLM API requests",
});

export const llmInputTokenCounter = meter.createCounter("llm.tokens.input", {
  description: "Number of input tokens consumed",
});

export const llmOutputTokenCounter = meter.createCounter("llm.tokens.output", {
  description: "Number of output tokens generated",
});

// --- High-level API ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Record a completed LLM request with token usage.
 * This is the main API to use in chat.ts
 */
export function recordLLMRequest(usage: TokenUsage): void {
  llmRequestCounter.add(1);
  llmInputTokenCounter.add(usage.inputTokens);
  llmOutputTokenCounter.add(usage.outputTokens);

  // Track cache stats if available
  if (usage.cacheCreationInputTokens || usage.cacheReadInputTokens) {
    const metrics = loadMetrics();
    metrics.totalCacheCreationTokens += usage.cacheCreationInputTokens ?? 0;
    metrics.totalCacheReadTokens += usage.cacheReadInputTokens ?? 0;

    // Calculate cache hit rate (requests with cache reads / total requests)
    const hasCache = (usage.cacheReadInputTokens ?? 0) > 0;
    const totalWithCache = hasCache ? 1 : 0;
    // Simple rolling calculation - weight new data
    metrics.cacheHitRate =
      (metrics.cacheHitRate * (metrics.requestCount - 1) + totalWithCache * 100) /
      metrics.requestCount;

    saveMetrics(metrics);
  }
}

/**
 * Get current metrics snapshot (useful for debugging/monitoring)
 */
export function getMetrics(): MetricsData {
  return loadMetrics();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  saveMetrics({
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
  });
}

// Export the meter provider for advanced usage
export { meterProvider, meter };
