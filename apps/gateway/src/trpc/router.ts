import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import {
  createInstanceInputSchema,
  renameInstanceInputSchema,
  deleteInstanceInputSchema,
  getSessionsInputSchema,
  getSessionInputSchema,
  deleteSessionInputSchema,
  type Instance,
  type SessionInfo,
  type MetricsData,
  type HealthStatus,
} from "@oink/trpc";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import { config, getInstanceDir, DEFAULT_INSTANCE_ID } from "../config.js";
import { SessionManager } from "../session/session-manager.js";
import { getMetrics, resetMetrics } from "../lib/telemetry/index.js";
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

        return SessionManager.listSessions(instanceId);
      }),

    get: publicProcedure.input(getSessionInputSchema).query(({ input }) => {
      const instanceId = input.instanceId || DEFAULT_INSTANCE_ID;
      const manager = new SessionManager({
        sessionId: input.sessionId,
        instanceId,
      });

      return manager.getMessages();
    }),

    delete: publicProcedure
      .input(deleteSessionInputSchema)
      .mutation(({ input }): { success: boolean } => {
        const instanceId = input.instanceId || DEFAULT_INSTANCE_ID;
        const sessionsDir = join(getInstanceDir(instanceId), "sessions");
        const sessionDir = join(sessionsDir, input.sessionId);

        if (existsSync(sessionDir)) {
          rmSync(sessionDir, { recursive: true });
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
});

export type AppRouter = typeof appRouter;
