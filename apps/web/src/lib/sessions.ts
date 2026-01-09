import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trpcServer } from "./trpc-server";

// Re-export the SessionInfo type from the shared package
export type { SessionInfo } from "@oink/trpc";

const getSessionsSchema = z
  .object({
    instanceId: z.string().optional(),
  })
  .optional();

export const getSessionsServerFn = createServerFn({ method: "GET" })
  .inputValidator(getSessionsSchema)
  .handler(async ({ data }) => {
    return trpcServer.sessions.list.query({ instanceId: data?.instanceId });
  });

const getSessionSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string().optional(),
});

export const getSessionServerFn = createServerFn({ method: "GET" })
  .inputValidator(getSessionSchema)
  .handler(async ({ data }) => {
    return trpcServer.sessions.get.query({
      sessionId: data.sessionId,
      instanceId: data.instanceId,
    });
  });

const deleteSessionSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string().optional(),
});

export const deleteSessionServerFn = createServerFn({ method: "POST" })
  .inputValidator(deleteSessionSchema)
  .handler(async ({ data }) => {
    return trpcServer.sessions.delete.mutate({
      sessionId: data.sessionId,
      instanceId: data.instanceId,
    });
  });
