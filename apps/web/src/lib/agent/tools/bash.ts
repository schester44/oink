import { logger } from "@/lib/logger";
import { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { spawn } from "child_process";
import { resolve, relative } from "path";
import { z } from "zod";
import { tool } from "ai";

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB

interface BashToolOptions {
  workspaceDir: string;
  providerOptions?: SharedV3ProviderOptions;
}

interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  message: string;
}

function isPathInWorkspace(targetPath: string, workspace: string): boolean {
  // If it's just a filename (no path separators or parent refs), it's safe
  // since it will be relative to the workspace cwd
  if (!targetPath.includes("/") && !targetPath.startsWith("..")) {
    return true;
  }

  const resolvedTarget = resolve(workspace, targetPath);
  const relativePath = relative(workspace, resolvedTarget);

  return (
    !relativePath.startsWith("..") && !resolve(relativePath).startsWith("/")
  );
}

function validateDestructiveCommand(
  command: string,
  workspace: string,
): string | null {
  // Match rm/rmdir commands and extract paths
  const destructivePatterns = [
    /\brm\s+(-[^\s]*\s+)*(.+)/i,
    /\brmdir\s+(-[^\s]*\s+)*(.+)/i,
  ];

  for (const pattern of destructivePatterns) {
    const match = command.match(pattern);

    if (match) {
      const argsStr = match[2] ?? "";
      // Split on spaces but respect quotes
      const paths = argsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];

      for (const p of paths) {
        // Skip flags
        if (p.startsWith("-")) continue;
        // Remove quotes
        const cleanPath = p.replace(/^["']|["']$/g, "");

        if (!isPathInWorkspace(cleanPath, workspace)) {
          return `Blocked: cannot delete '${cleanPath}' - path is outside workspace`;
        }
      }
    }
  }

  return null;
}

export function createBashTool({
  workspaceDir,
  providerOptions,
}: BashToolOptions) {
  const bashTool = tool({
    providerOptions,
    description: `Execute a shell command in the workspace. Returns stdout, stderr, and exit code. Output is truncated to ${MAX_OUTPUT_BYTES / 1024}KB. Commands timeout after ${DEFAULT_TIMEOUT / 1000} seconds. Default working directory is the workspace.`,
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for the command (defaults to workspace)"),
      timeout: z
        .number()
        .optional()
        .describe(`Timeout in milliseconds (default: ${DEFAULT_TIMEOUT})`),
    }),
    execute: async ({ command, cwd, timeout }) => {
      const timeoutMs = timeout ?? DEFAULT_TIMEOUT;
      const workspace = cwd ?? workspaceDir;

      logger.info(
        "Executing bashTool with command: %s in %s",
        command,
        workspace,
      );

      // Validate destructive commands
      const validationError = validateDestructiveCommand(command, workspace);
      console.log("\x1b[33m%s\x1b[0m", "🪵 validationError", validationError);

      if (validationError) {
        return {
          stdout: "",
          stderr: validationError,
          exitCode: 1,
          message: validationError,
        };
      }

      return new Promise<BashResult>((resolve) => {
        const proc = spawn("sh", ["-c", command], {
          cwd: workspace,
          timeout: timeoutMs,
        });

        let stdout = "";
        let stderr = "";
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let stdoutTruncated = false;
        let stderrTruncated = false;

        proc.stdout.on("data", (data: Buffer) => {
          if (stdoutTruncated) return;
          const chunk = data.toString();

          if (stdoutBytes + chunk.length > MAX_OUTPUT_BYTES) {
            stdout += chunk.slice(0, MAX_OUTPUT_BYTES - stdoutBytes);
            stdoutTruncated = true;
          } else {
            stdout += chunk;
            stdoutBytes += chunk.length;
          }
        });

        proc.stderr.on("data", (data: Buffer) => {
          if (stderrTruncated) return;
          const chunk = data.toString();

          if (stderrBytes + chunk.length > MAX_OUTPUT_BYTES) {
            stderr += chunk.slice(0, MAX_OUTPUT_BYTES - stderrBytes);
            stderrTruncated = true;
          } else {
            stderr += chunk;
            stderrBytes += chunk.length;
          }
        });

        proc.on("error", (err) => {
          resolve({
            stdout: "",
            stderr: "",
            exitCode: null,
            message: `Error: ${err.message}`,
          });
        });

        proc.on("close", (code, signal) => {
          let message: string;

          if (signal === "SIGTERM") {
            message = `Command timed out after ${timeoutMs}ms`;
          } else if (code === 0) {
            message = "Command completed successfully";
          } else {
            message = `Command exited with code ${code}`;
          }

          if (stdoutTruncated) {
            stdout += "\n[stdout truncated]";
          }

          if (stderrTruncated) {
            stderr += "\n[stderr truncated]";
          }

          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code,
            message,
          });
        });
      });
    },
  });

  return bashTool;
}
