// Build system prompts from brain files

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

import { getWorkspaceDir } from "../config.js";
import { formatSkillsForPrompt } from "../agent/skills.js";

function loadTemplate(filename: string, workspaceDir: string) {
  const path = join(workspaceDir, filename);

  if (!existsSync(path)) return null;

  try {
    const contents = readFileSync(path, "utf-8");
    const { content, data } = matter(contents);

    return { content, path, frontmatter: data };
  } catch (error) {
    console.error(`Error loading template ${filename}:`, error);

    return null;
  }
}

function loadSkills(workspaceDir: string) {
  const skillsDir = join(workspaceDir, "skills");

  if (!existsSync(skillsDir)) return [];

  const skillFiles = readdirSync(skillsDir).filter((file: string) =>
    file.endsWith(".md"),
  );

  const skills = skillFiles
    .map((file: string) => {
      const path = join(skillsDir, file);
      const contents = readFileSync(path, "utf-8");
      const { content, data } = matter(contents);

      if (!data.name || !data.description) return null;

      return {
        content,
        path,
        name: data.name || file.replace(".md", ""),
        description: data.description || "",
      };
    })
    .filter((skill) => skill !== null) as {
    content: string;
    path: string;
    name: string;
    description: string;
  }[];

  return skills;
}

interface BuildSystemPromptOptions {
  instanceId: string;
}

export function buildSystemPrompt({
  instanceId,
}: BuildSystemPromptOptions): string {
  const workspaceDir = getWorkspaceDir(instanceId);
  const soul = loadTemplate("SOUL.md", workspaceDir);
  const identity = loadTemplate("IDENTITY.md", workspaceDir);
  const user = loadTemplate("USER.md", workspaceDir);
  const bootstrap = loadTemplate("BOOTSTRAP.md", workspaceDir);
  const agents = loadTemplate("AGENTS.md", workspaceDir);
  const tools = loadTemplate("TOOLS.md", workspaceDir);
  const skills = loadSkills(workspaceDir);

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

  if (agents) {
    parts.push(agents.content);
  }

  if (tools) {
    parts.push(tools.content);
  }

  if (user) {
    parts.push(user.content);
  }

  if (skills.length > 0) {
    parts.push(formatSkillsForPrompt(skills));
  }

  parts.push(`

# Context
- You have access to previous conversation context including tool results from prior turns.
- For older history beyond your context, search log.jsonl (contains user messages and your final responses, but not tool results).

# Current Context

- Current time: ${new Date().toISOString()}
- Current working directory: ${process.cwd()}
- Workspace directory: ${workspaceDir}

Remember: Be concise, helpful, and genuinely yourself.
`);

  return parts.join("\n\n---\n\n");
}
