import { z } from "zod";

// Instance schemas
export const instanceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const createInstanceInputSchema = z.object({
  name: z.string().min(1),
});

export const renameInstanceInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

export const deleteInstanceInputSchema = z.object({
  id: z.string(),
});

// Session schemas
export const sessionInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  timestamp: z.string(),
});

export const getSessionsInputSchema = z.object({
  instanceId: z.string().optional(),
});

export const getSessionInputSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string().optional(),
});

export const deleteSessionInputSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string().optional(),
});

// Metrics schemas
export const metricsDataSchema = z.object({
  requestCount: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalTokens: z.number(),
  avgInputTokensPerRequest: z.number(),
  avgOutputTokensPerRequest: z.number(),
  avgTokensPerRequest: z.number(),
  lastUpdated: z.string(),
  histogram: z.object({
    inputTokens: z.array(z.number()),
    outputTokens: z.array(z.number()),
    totalTokens: z.array(z.number()),
  }),
});

// Health schemas
export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

// Type exports
export type Instance = z.infer<typeof instanceSchema>;
export type CreateInstanceInput = z.infer<typeof createInstanceInputSchema>;
export type RenameInstanceInput = z.infer<typeof renameInstanceInputSchema>;
export type DeleteInstanceInput = z.infer<typeof deleteInstanceInputSchema>;

export type SessionInfo = z.infer<typeof sessionInfoSchema>;
export type GetSessionsInput = z.infer<typeof getSessionsInputSchema>;
export type GetSessionInput = z.infer<typeof getSessionInputSchema>;
export type DeleteSessionInput = z.infer<typeof deleteSessionInputSchema>;

export type MetricsData = z.infer<typeof metricsDataSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
