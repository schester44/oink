import { logger } from "../../logger.js";
import { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { tool } from "ai";
import { readFile, writeFile } from "fs/promises";
import { resolve, relative } from "path";
import { z } from "zod";

interface EditToolOptions {
  workspaceDir: string;
  providerOptions?: SharedV3ProviderOptions;
}

function isPathInWorkspace(targetPath: string, workspace: string): boolean {
  const resolvedTarget = resolve(workspace, targetPath);
  const relativePath = relative(workspace, resolvedTarget);

  // Path is in workspace if it doesn't escape via ".." and isn't absolute
  return !relativePath.startsWith("..") && !relativePath.startsWith("/");
}

export function createEditTool({
  workspaceDir,
  providerOptions,
}: EditToolOptions) {
  const editTool = tool({
    providerOptions,
    description:
      "Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("The file path to edit (relative to workspace)"),
      oldText: z.string().describe("The exact text to find and replace"),
      newText: z.string().describe("The text to replace oldText with"),
    }),
    execute: async ({ path, oldText, newText }) => {
      logger.info("Executing editTool on file: %s", path);

      // Validate path is within workspace
      if (!isPathInWorkspace(path, workspaceDir)) {
        return {
          success: false,
          message: `Blocked: cannot edit '${path}' - path is outside workspace ({${workspaceDir}})`,
        };
      }

      const fullPath = resolve(workspaceDir, path);

      try {
        // Read the file
        const content = await readFile(fullPath, "utf-8");

        // Check if oldText exists
        const occurrences = content.split(oldText).length - 1;

        if (occurrences === 0) {
          return {
            success: false,
            message: `oldText not found in file. Make sure the text matches exactly, including whitespace and line endings.`,
          };
        }

        if (occurrences > 1) {
          return {
            success: false,
            message: `oldText found ${occurrences} times. It must be unique to avoid ambiguous edits. Include more surrounding context to make it unique.`,
          };
        }

        // Perform the replacement
        const newContent = content.replace(oldText, newText);

        // Write the file
        await writeFile(fullPath, newContent, "utf-8");

        return {
          success: true,
          message: `Successfully edited ${path}`,
        };
      } catch (err) {
        const error = err as NodeJS.ErrnoException;

        if (error.code === "ENOENT") {
          return {
            success: false,
            message: `File not found: ${path}`,
          };
        }

        return {
          success: false,
          message: `Error editing file: ${error.message}`,
        };
      }
    },
  });

  return editTool;
}
