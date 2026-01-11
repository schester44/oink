import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import {
  createInstanceInputSchema,
  renameInstanceInputSchema,
  deleteInstanceInputSchema,
  getSessionsInputSchema,
  getSessionInputSchema,
  deleteSessionInputSchema,
  updateSettingsInputSchema,
  updatePluginInputSchema,
  type Instance,
  type SessionInfo,
  type MetricsData,
  type HealthStatus,
  type UserSettings,
  type PluginsConfig,
} from "@pinky/trpc";
import {
  SessionManager,
  type SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import {
  config,
  getSessionsDir,
  getWorkspaceDir,
  DEFAULT_INSTANCE_ID,
} from "../config.js";
import { getMetrics, resetMetrics } from "../lib/telemetry/index.js";
import { readSettings, writeSettings } from "../lib/settings.js";
import type { Context } from "./context.js";

const startTime = Date.now();

// Initialize tRPC with context
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

const router = t.router;
const publicProcedure = t.procedure;

// --- Instance helpers ---

function getInstancesDir(): string {
  return join(config.dataDir, "instances");
}

function getInstanceMetaPath(instanceId: string): string {
  return join(getInstancesDir(), instanceId, "meta.json");
}

interface InstanceMeta {
  name: string;
}

function readInstanceMeta(instanceId: string): InstanceMeta {
  const metaPath = getInstanceMetaPath(instanceId);

  if (existsSync(metaPath)) {
    const content = readFileSync(metaPath, "utf-8");

    return JSON.parse(content) as InstanceMeta;
  }

  return { name: instanceId };
}

function writeInstanceMeta(instanceId: string, meta: InstanceMeta): void {
  const metaPath = getInstanceMetaPath(instanceId);
  const instanceDir = join(getInstancesDir(), instanceId);

  if (!existsSync(instanceDir)) {
    mkdirSync(instanceDir, { recursive: true });
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

// --- Router implementation ---

export const appRouter = router({
  health: router({
    check: publicProcedure.query((): HealthStatus => {
      return {
        status: "ok",
        version: "0.1.0",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      };
    }),
  }),

  instances: router({
    list: publicProcedure.query((): Instance[] => {
      const instancesDir = getInstancesDir();

      if (!existsSync(instancesDir)) {
        mkdirSync(instancesDir, { recursive: true });
        writeInstanceMeta(DEFAULT_INSTANCE_ID, { name: "default" });

        return [{ id: DEFAULT_INSTANCE_ID, name: "default" }];
      }

      const dirs = readdirSync(instancesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      if (dirs.length === 0) {
        writeInstanceMeta(DEFAULT_INSTANCE_ID, { name: "default" });

        return [{ id: DEFAULT_INSTANCE_ID, name: "default" }];
      }

      return dirs.map((id) => {
        const meta = readInstanceMeta(id);

        return { id, name: meta.name };
      });
    }),

    create: publicProcedure
      .input(createInstanceInputSchema)
      .mutation(({ input }): Instance => {
        const id = crypto.randomUUID();
        writeInstanceMeta(id, { name: input.name });

        return { id, name: input.name };
      }),

    rename: publicProcedure
      .input(renameInstanceInputSchema)
      .mutation(({ input }): Instance => {
        writeInstanceMeta(input.id, { name: input.name });

        return { id: input.id, name: input.name };
      }),

    delete: publicProcedure
      .input(deleteInstanceInputSchema)
      .mutation(({ input }): { success: boolean } => {
        if (input.id === DEFAULT_INSTANCE_ID) {
          throw new Error("Cannot delete the default instance");
        }

        const instanceDir = join(getInstancesDir(), input.id);

        if (existsSync(instanceDir)) {
          rmSync(instanceDir, { recursive: true });
        }

        return { success: true };
      }),
  }),

  sessions: router({
    list: publicProcedure
      .input(getSessionsInputSchema.optional())
      .query(({ input }): SessionInfo[] => {
        const instanceId = input?.instanceId || DEFAULT_INSTANCE_ID;
        const workspaceDir = getWorkspaceDir(instanceId);
        const sessionsDir = getSessionsDir(instanceId);

        // Use pi-coding-agent's SessionManager.list()
        return SessionManager.list(workspaceDir, sessionsDir);
      }),

    get: publicProcedure.input(getSessionInputSchema).query(({ input }) => {
      const instanceId = input.instanceId || DEFAULT_INSTANCE_ID;
      const sessionsDir = getSessionsDir(instanceId);

      // Find the session file by ID
      const sessionFiles = existsSync(sessionsDir)
        ? readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"))
        : [];

      const sessionFile = sessionFiles.find((f) => f.includes(input.sessionId));

      if (!sessionFile) {
        return [];
      }

      const sessionPath = join(sessionsDir, sessionFile);
      const manager = SessionManager.open(sessionPath, sessionsDir);
      const entries = manager.getEntries();

      // Build a map of toolCallId -> toolResult for lookup
      const toolResultsMap = new Map<
        string,
        { content: unknown; details?: unknown }
      >();
      for (const e of entries) {
        if (e.type !== "message") continue;
        const msg = e.message as { role: string; toolCallId?: string; content?: unknown; details?: unknown };
        if (msg.role === "toolResult" && msg.toolCallId) {
          toolResultsMap.set(msg.toolCallId, {
            content: msg.content,
            details: msg.details,
          });
        }
      }

      // Convert to UI-friendly format
      // Filter to message entries and convert to the format the UI expects
      return entries
        .filter((e): e is SessionMessageEntry => e.type === "message")
        .filter(
          (e) => e.message.role === "user" || e.message.role === "assistant",
        )
        .map((e) => {
          // AgentMessage with role user/assistant will have content array
          const msg = e.message as {
            role: string;
            content: Array<{
              type: string;
              text?: string;
              id?: string;
              name?: string;
              arguments?: unknown;
            }>;
          };

          return {
            id: e.id,
            role: msg.role,
            parts: msg.content.map((c) => {
              if (c.type === "text") {
                return { type: "text" as const, text: c.text || "" };
              }

              if (c.type === "toolCall") {
                const toolResult = c.id ? toolResultsMap.get(c.id) : undefined;
                // Format output to match what tool-display.tsx expects:
                // { content: [...], details?: {...} } for edit tools with diff
                // { content: [...] } for read/bash tools
                const output = toolResult
                  ? {
                      content: toolResult.content,
                      ...(toolResult.details ? { details: toolResult.details } : {}),
                    }
                  : undefined;
                return {
                  type: `tool-${c.name || "unknown"}`,
                  toolCallId: c.id || "",
                  input: c.arguments as Record<string, unknown> | undefined,
                  output,
                  state: "result" as const,
                };
              }

              return { type: "text" as const, text: "" };
            }),
          };
        });
    }),

    delete: publicProcedure
      .input(deleteSessionInputSchema)
      .mutation(({ input }): { success: boolean } => {
        const instanceId = input.instanceId || DEFAULT_INSTANCE_ID;
        const sessionsDir = getSessionsDir(instanceId);

        // Find and delete the session file by ID
        if (existsSync(sessionsDir)) {
          const sessionFiles = readdirSync(sessionsDir).filter((f) =>
            f.endsWith(".jsonl"),
          );
          const sessionFile = sessionFiles.find((f) =>
            f.includes(input.sessionId),
          );

          if (sessionFile) {
            rmSync(join(sessionsDir, sessionFile));
          }
        }

        return { success: true };
      }),
  }),

  metrics: router({
    get: publicProcedure.query((): MetricsData => {
      return getMetrics();
    }),

    reset: publicProcedure.mutation((): { success: boolean } => {
      resetMetrics();

      return { success: true };
    }),
  }),

  settings: router({
    get: publicProcedure.query((): UserSettings => {
      return readSettings();
    }),

    update: publicProcedure
      .input(updateSettingsInputSchema)
      .mutation(({ input }): UserSettings => {
        const current = readSettings();
        const updated = { ...current, ...input };
        writeSettings(updated);

        return updated;
      }),
  }),

  plugins: router({
    list: publicProcedure.query((): PluginsConfig => {
      const pluginsPath = join(config.dataDir, "plugins.json");

      if (!existsSync(pluginsPath)) {
        return { plugins: {} };
      }

      const content = readFileSync(pluginsPath, "utf-8");
      return JSON.parse(content) as PluginsConfig;
    }),

    update: publicProcedure
      .input(updatePluginInputSchema)
      .mutation(({ input }): PluginsConfig => {
        const pluginsPath = join(config.dataDir, "plugins.json");

        let pluginsConfig: PluginsConfig = { plugins: {} };

        if (existsSync(pluginsPath)) {
          const content = readFileSync(pluginsPath, "utf-8");
          pluginsConfig = JSON.parse(content) as PluginsConfig;
        }

        const plugin = pluginsConfig.plugins[input.pluginId];
        if (plugin) {
          plugin.enabled = input.enabled;
        }

        writeFileSync(pluginsPath, JSON.stringify(pluginsConfig, null, 2));

        return pluginsConfig;
      }),
  }),
});

export type AppRouter = typeof appRouter;
