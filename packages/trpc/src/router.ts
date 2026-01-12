import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import {
  instanceSchema,
  createInstanceInputSchema,
  renameInstanceInputSchema,
  deleteInstanceInputSchema,
  sessionInfoSchema,
  getSessionsInputSchema,
  getSessionInputSchema,
  deleteSessionInputSchema,
  metricsDataSchema,
  healthStatusSchema,
  userSettingsSchema,
  updateSettingsInputSchema,
  pluginsConfigSchema,
  updatePluginInputSchema,
  updateTranscriptionInputSchema,
  updateTTSInputSchema,
  transcriptionConfigSchema,
  ttsConfigSchema,
} from "./schemas";

// Initialize tRPC - this creates the procedure builders
const t = initTRPC.create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Message schema for session.get response
const messageEventSchema = z.object({
  type: z.literal("message"),
  id: z.string(),
  timestamp: z.string(),
  cwd: z.string(),
  parentId: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.any()),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
});

// Define the router shape with explicit output types for proper inference
export const appRouterDefinition = router({
  health: router({
    check: publicProcedure.output(healthStatusSchema).query(() => {
      throw new Error("Not implemented - use gateway");
    }),
  }),

  instances: router({
    list: publicProcedure.output(z.array(instanceSchema)).query(() => {
      throw new Error("Not implemented - use gateway");
    }),
    create: publicProcedure
      .input(createInstanceInputSchema)
      .output(instanceSchema)
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
    rename: publicProcedure
      .input(renameInstanceInputSchema)
      .output(instanceSchema)
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
    delete: publicProcedure
      .input(deleteInstanceInputSchema)
      .output(z.object({ success: z.boolean() }))
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
  }),

  sessions: router({
    list: publicProcedure
      .input(getSessionsInputSchema.optional())
      .output(z.array(sessionInfoSchema))
      .query(() => {
        throw new Error("Not implemented - use gateway");
      }),
    get: publicProcedure
      .input(getSessionInputSchema)
      .output(z.array(messageEventSchema))
      .query(() => {
        throw new Error("Not implemented - use gateway");
      }),
    delete: publicProcedure
      .input(deleteSessionInputSchema)
      .output(z.object({ success: z.boolean() }))
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
  }),

  metrics: router({
    get: publicProcedure.output(metricsDataSchema).query(() => {
      throw new Error("Not implemented - use gateway");
    }),
    reset: publicProcedure
      .output(z.object({ success: z.boolean() }))
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
  }),

  settings: router({
    get: publicProcedure.output(userSettingsSchema).query(() => {
      throw new Error("Not implemented - use gateway");
    }),
    update: publicProcedure
      .input(updateSettingsInputSchema)
      .output(userSettingsSchema)
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
  }),

  plugins: router({
    list: publicProcedure.output(pluginsConfigSchema).query(() => {
      throw new Error("Not implemented - use gateway");
    }),
    update: publicProcedure
      .input(updatePluginInputSchema)
      .output(pluginsConfigSchema)
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
    updateTranscription: publicProcedure
      .input(updateTranscriptionInputSchema)
      .output(pluginsConfigSchema)
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
    updateTTS: publicProcedure
      .input(updateTTSInputSchema)
      .output(pluginsConfigSchema)
      .mutation(() => {
        throw new Error("Not implemented - use gateway");
      }),
  }),
});

// Export the router type for client inference
export type AppRouter = typeof appRouterDefinition;
