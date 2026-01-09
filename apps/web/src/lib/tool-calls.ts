import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Stub implementation for tool calls visibility toggle
// TODO: Move this to gateway configuration or persist in localStorage

let showToolCalls = false;

export const getShowToolCallsServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  return showToolCalls;
});

export const setShowToolCallsServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.boolean())
  .handler(async ({ data }) => {
    showToolCalls = data;
    return showToolCalls;
  });
