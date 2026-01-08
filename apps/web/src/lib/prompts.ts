import { readFileSync, existsSync } from "fs";
import { join } from "path";

const TEMPLATES_DIR = join(process.cwd(), "apps/web/src/templates");

function readTemplate(filename: string): string | null {
  const path = join(TEMPLATES_DIR, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function buildSystemPrompt(): string {
  const soul = readTemplate("SOUL.md");
  const identity = readTemplate("IDENTITY.md");
  const user = readTemplate("USER.md");

  const parts: string[] = [];

  if (soul) {
    parts.push("# Your Soul\n\n" + soul);
  }

  if (identity) {
    parts.push("# Your Identity\n\n" + identity);
  }

  if (user) {
    parts.push("# About Your User\n\n" + user);
  }

  parts.push(`
# Current Context

- Current time: ${new Date().toISOString()}
- Platform: Web chat interface

Remember: Be concise, helpful, and genuinely yourself.
`);

  return parts.join("\n\n---\n\n");
}
