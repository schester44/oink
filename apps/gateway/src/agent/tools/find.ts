import { logger } from "../../logger.js";
import { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { tool } from "ai";
import { spawn } from "child_process";
import { z } from "zod";

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB

interface FindToolOptions {
  workspaceDir: string;
  providerOptions?: SharedV3ProviderOptions;
}

interface FindResult {
  files: string[];
  truncated: boolean;
  message: string;
}

export function createFindTool({
  workspaceDir,
  providerOptions,
}: FindToolOptions) {
  const findTool = tool({
    providerOptions,
    description: `Search for files by glob pattern in the workspace. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
    inputSchema: z.object({
      pattern: z
        .string()
        .describe(
          "The glob pattern to match files (e.g., '*.ts', '**/*.json')",
        ),
      path: z
        .string()
        .optional()
        .describe("Directory to search in (defaults to workspace)"),
      limit: z
        .number()
        .optional()
        .default(DEFAULT_LIMIT)
        .describe(
          `Maximum number of results to return (default: ${DEFAULT_LIMIT})`,
        ),
    }),
    execute: async ({ pattern, path, limit }) => {
      const maxResults = limit ?? DEFAULT_LIMIT;
      const searchPath = path ?? workspaceDir;

      logger.info(
        "Executing findTool with pattern: %s in %s",
        pattern,
        searchPath,
      );

      // Use fd with glob pattern - respects .gitignore by default
      const args = [
        "--glob",
        pattern,
        "--color",
        "never",
        "--hidden",
        "--type",
        "f",
      ];

      return new Promise<FindResult>((resolve) => {
        const fd = spawn("fd", args, { cwd: searchPath });

        let buffer = "";
        const files: string[] = [];
        let truncated = false;
        let bytes = 0;

        fd.stdout.on("data", (data: Buffer) => {
          if (truncated) return;

          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line) continue;
            if (files.length >= maxResults || bytes >= DEFAULT_MAX_BYTES) {
              truncated = true;
              break;
            }

            files.push(line);
            bytes += line.length + 1;
          }
        });

        fd.on("error", (err) => {
          resolve({
            files: [],
            truncated: false,
            message: `Error: ${err.message}`,
          });
        });

        fd.on("close", (code) => {
          // Process any remaining buffer content
          if (!truncated && buffer) {
            if (files.length < maxResults && bytes < DEFAULT_MAX_BYTES) {
              files.push(buffer);
            } else {
              truncated = true;
            }
          }

          if (code !== 0 && files.length === 0) {
            resolve({
              files: [],
              truncated: false,
              message:
                code === 1
                  ? "No files found"
                  : `Error: fd exited with code ${code}`,
            });
          } else {
            const message = truncated
              ? `Found ${files.length} files (truncated)`
              : `Found ${files.length} files`;
            resolve({ files, truncated, message });
          }
        });
      });
    },
  });

  return findTool;
}
