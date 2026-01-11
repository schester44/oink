import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trpcServer } from "./trpc-server";

// Re-export the UserSettings type from the shared package
export type { UserSettings } from "@oink/trpc";

export const getSettingsServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return trpcServer.settings.get.query();
  },
);

const updateSettingsSchema = z.object({
  timezone: z.string().optional(),
});

export const saveSettingsServerFn = createServerFn({ method: "POST" })
  .inputValidator(updateSettingsSchema)
  .handler(async ({ data }) => {
    return trpcServer.settings.update.mutate(data);
  });
