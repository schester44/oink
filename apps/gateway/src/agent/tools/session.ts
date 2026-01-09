import { tool } from "ai";
import { z } from "zod";
import type { SessionManager } from "../../session/index.js";

interface SessionToolOptions {
  session: SessionManager;
}

export function createSessionTool({ session }: SessionToolOptions) {
  return tool({
    description:
      "Update the name of the current chat session. Use this to give the session a descriptive name based on what you're discussing. Keep names short (2-5 words).",
    inputSchema: z.object({
      name: z
        .string()
        .describe("The new name for the session (2-5 words, descriptive)"),
    }),
    execute: async ({ name }) => {
      session.updateName(name);
      return { success: true, name };
    },
  });
}
