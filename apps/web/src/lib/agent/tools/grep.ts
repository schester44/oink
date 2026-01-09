import { logger } from "@/lib/logger";
import { tool } from "ai";
import { spawn } from "child_process";
import { z } from "zod";
import { SharedV3ProviderOptions } from "@ai-sdk/provider";

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
const GREP_MAX_LINE_LENGTH = 500;

interface GrepToolOptions {
  workspaceDir: string;
  providerOptions?: SharedV3ProviderOptions;
}

interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

interface GrepResult {
  matches: GrepMatch[];
  truncated: boolean;
  message: string;
}

export function createGrepTool({
  workspaceDir,
  providerOptions,
}: GrepToolOptions) {
  const grepTool = tool({
    providerOptions,
    description: `Search file contents for a pattern in the workspace. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
    inputSchema: z.object({
      pattern: z.string().describe("The regex pattern to search for"),
      path: z
        .string()
        .optional()
        .describe("Directory or file to search in (defaults to workspace)"),
      glob: z
        .string()
        .optional()
        .describe('File glob pattern to filter (e.g., "*.ts")'),
      caseSensitive: z
        .boolean()
        .optional()
        .default(true)
        .describe("Case sensitive search"),
      literal: z
        .boolean()
        .optional()
        .describe(
          "Treat pattern as literal string instead of regex (default: false)",
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of matches to return (default: 100)"),
    }),
    execute: async ({ pattern, path, glob, caseSensitive, literal, limit }) => {
      const maxMatches = limit ?? DEFAULT_LIMIT;
      const searchPath = path ?? workspaceDir;

      logger.info(
        "Executing grepTool with pattern: %s in %s",
        pattern,
        searchPath,
      );

      const args = ["--json"];

      if (!caseSensitive) args.push("--ignore-case");
      if (literal) args.push("--fixed-strings");
      if (glob) args.push("--glob", glob);

      args.push(pattern);

      return new Promise<GrepResult>((resolve) => {
        const rg = spawn("rg", args, { cwd: searchPath });

        let buffer = "";
        const matches: GrepMatch[] = [];
        let truncated = false;
        let bytes = 0;

        rg.stdout.on("data", (data: Buffer) => {
          if (truncated) return;

          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line) continue;
            if (matches.length >= maxMatches || bytes >= DEFAULT_MAX_BYTES) {
              truncated = true;
              break;
            }

            try {
              const json = JSON.parse(line);

              if (json.type === "match") {
                const text = json.data.lines.text.trimEnd();
                const truncatedText =
                  text.length > GREP_MAX_LINE_LENGTH
                    ? text.slice(0, GREP_MAX_LINE_LENGTH) + "..."
                    : text;
                matches.push({
                  file: json.data.path.text,
                  line: json.data.line_number,
                  text: truncatedText,
                });

                bytes += truncatedText.length;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        });

        rg.on("error", (err) => {
          resolve({
            matches: [],
            truncated: false,
            message: `Error: ${err.message}`,
          });
        });

        rg.on("close", (code) => {
          if (code === 1 && matches.length === 0) {
            resolve({
              matches: [],
              truncated: false,
              message: "No matches found",
            });
          } else if (code !== 0 && code !== 1) {
            resolve({
              matches: [],
              truncated: false,
              message: `Error: ripgrep exited with code ${code}`,
            });
          } else {
            const message = truncated
              ? `Found ${matches.length} matches (truncated)`
              : `Found ${matches.length} matches`;
            resolve({ matches, truncated, message });
          }
        });
      });
    },
  });

  return grepTool;
}
