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
// Matches pi-coding-agent's SessionInfo format
export const sessionInfoSchema = z.object({
  path: z.string(),
  id: z.string(),
  created: z.date(),
  modified: z.date(),
  messageCount: z.number(),
  firstMessage: z.string(),
  allMessagesText: z.string(),
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
  // Cache stats (Anthropic prompt caching)
  totalCacheCreationTokens: z.number().default(0),
  totalCacheReadTokens: z.number().default(0),
  cacheHitRate: z.number().default(0),
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

// Settings schemas
export const userSettingsSchema = z.object({
  timezone: z.string(),
});

export const updateSettingsInputSchema = userSettingsSchema.partial();

// Plugin schemas
export const pluginConfigSchema = z
  .object({
    enabled: z.boolean(),
  })
  .catchall(z.any());

export const pluginsConfigSchema = z.object({
  plugins: z.record(z.string(), pluginConfigSchema),
});

export const updatePluginInputSchema = z.object({
  pluginId: z.string(),
  enabled: z.boolean(),
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

export type UserSettings = z.infer<typeof userSettingsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type PluginsConfig = z.infer<typeof pluginsConfigSchema>;
export type UpdatePluginInput = z.infer<typeof updatePluginInputSchema>;
