import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import * as z from "zod";

const storageKey = "showToolCalls";

export const getShowToolCallsServerFn = createServerFn().handler(
  async () => getCookie(storageKey) === "true"
);

export const setShowToolCallsServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.boolean())
  .handler(async ({ data }) => setCookie(storageKey, String(data)));
