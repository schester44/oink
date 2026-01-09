import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "../templates");

function readTemplate(filename: string): string {
  return readFileSync(join(templatesDir, filename), "utf-8");
}

/**
 * Default content for brain files
 * These are used when initializing a new agent workspace
 */

export const DEFAULT_AGENTS_PROMPT = readTemplate("AGENTS.md");
export const DEFAULT_BOOTSTRAP_PROMPT = readTemplate("BOOTSTRAP.md");
export const DEFAULT_IDENTITY_PROMPT = readTemplate("IDENTITY.md");
export const DEFAULT_SOUL_PROMPT = readTemplate("SOUL.md");
export const DEFAULT_TOOLS_PROMPT = readTemplate("TOOLS.md");
export const DEFAULT_USER_PROMPT = readTemplate("USER.md");
