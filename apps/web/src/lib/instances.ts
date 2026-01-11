import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trpcServer } from "./trpc-server";

// Re-export the Instance type from the shared package
export type { Instance } from "@pinky/trpc";

export const getInstancesServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return trpcServer.instances.list.query();
  },
);

const createInstanceSchema = z.object({
  name: z.string().min(1),
});

export const createInstanceServerFn = createServerFn({ method: "POST" })
  .inputValidator(createInstanceSchema)
  .handler(async ({ data }) => {
    return trpcServer.instances.create.mutate({ name: data.name });
  });

const renameInstanceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

export const renameInstanceServerFn = createServerFn({ method: "POST" })
  .inputValidator(renameInstanceSchema)
  .handler(async ({ data }) => {
    return trpcServer.instances.rename.mutate({ id: data.id, name: data.name });
  });

const deleteInstanceSchema = z.object({
  id: z.string(),
});

export const deleteInstanceServerFn = createServerFn({ method: "POST" })
  .inputValidator(deleteInstanceSchema)
  .handler(async ({ data }) => {
    return trpcServer.instances.delete.mutate({ id: data.id });
  });
