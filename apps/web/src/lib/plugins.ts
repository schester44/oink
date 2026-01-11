import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trpcServer } from "./trpc-server";

export type { PluginsConfig, PluginConfig } from "@pinky/trpc";

export const getPluginsServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return trpcServer.plugins.list.query();
  },
);

const updatePluginSchema = z.object({
  pluginId: z.string(),
  enabled: z.boolean(),
});

export const updatePluginServerFn = createServerFn({ method: "POST" })
  .inputValidator(updatePluginSchema)
  .handler(async ({ data }) => {
    return trpcServer.plugins.update.mutate(data);
  });
