import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SessionManager } from "./session";
import { DEFAULT_INSTANCE_ID } from "./config";

const getSessionsSchema = z
  .object({
    instanceId: z.string().optional(),
  })
  .optional();

export const getSessionsServerFn = createServerFn({ method: "GET" })
  .inputValidator(getSessionsSchema)
  .handler(async ({ data }) => {
    const instanceId = data?.instanceId || DEFAULT_INSTANCE_ID;

    return SessionManager.listSessions(instanceId);
  });
