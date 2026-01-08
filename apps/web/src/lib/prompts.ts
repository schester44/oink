import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { config } from "./config";

function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return content;
  const start = endIndex + "\n---".length;
  let trimmed = content.slice(start);
  trimmed = trimmed.replace(/^\s+/, "");

  return trimmed;
}

function loadTemplate(filename: string, workspaceDir: string) {
  const path = join(workspaceDir, filename);

  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, "utf-8");

    return { content: stripFrontMatter(content), path };
  } catch (error) {
    console.error(`Error loading template ${filename}:`, error);
  }
}

interface BuildSystemPromptOptions {
  workspaceDir?: string;
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions = {}): string {
  const { workspaceDir = config.workspaceDir } = opts;
  const soul = loadTemplate("SOUL.md", workspaceDir);
  const identity = loadTemplate("IDENTITY.md", workspaceDir);
  const user = loadTemplate("USER.md", workspaceDir);
  const bootstrap = loadTemplate("BOOTSTRAP.md", workspaceDir);

  const parts: string[] = [];

  if (bootstrap) {
    parts.push(bootstrap.content);
  }

  if (soul) {
    parts.push(soul.content);
  }

  if (identity) {
    parts.push(identity.content);
  }

  if (user) {
    parts.push(user.content);
  }

  parts.push(`
# Current Context

- Current time: ${new Date().toISOString()}
- Current working directory: ${process.cwd()}
- Workspace directory: ${workspaceDir}

Remember: Be concise, helpful, and genuinely yourself.
`);

  return parts.join("\n\n---\n\n");
}
