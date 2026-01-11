// Build system prompts from brain files

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

import { getWorkspaceDir, config } from "../config.js";
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

function loadSkillsFromDir(
  skillsDir: string,
  depth: number = 0,
): {
  content: string;
  path: string;
  name: string;
  description: string;
}[] {
  const MAX_DEPTH = 3;

  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir);
  const skills: {
    content: string;
    path: string;
    name: string;
    description: string;
  }[] = [];

  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory() && depth < MAX_DEPTH) {
      skills.push(...loadSkillsFromDir(entryPath, depth + 1));
    } else if (entry.endsWith(".md")) {
      const contents = readFileSync(entryPath, "utf-8");
      const { content, data } = matter(contents);

      if (data.name && data.description) {
        skills.push({
          content,
          path: entryPath,
          name: data.name,
          description: data.description,
        });
      }
    }
  }

  return skills;
}

function loadSkills({ skillDirs }: { skillDirs: string[] }) {
  return skillDirs.flatMap((dir) => loadSkillsFromDir(dir));
}

interface BuildSystemPromptOptions {
  instanceId: string;
  userTimezone: string;
}

export function buildSystemPrompt({
  instanceId,
  userTimezone,
}: BuildSystemPromptOptions): string {
  const workspaceDir = getWorkspaceDir(instanceId);
  const soul = loadTemplate("SOUL.md", workspaceDir);
  const identity = loadTemplate("IDENTITY.md", workspaceDir);
  const user = loadTemplate("USER.md", workspaceDir);
  const bootstrap = loadTemplate("BOOTSTRAP.md", workspaceDir);
  const agents = loadTemplate("AGENTS.md", workspaceDir);
  const tools = loadTemplate("TOOLS.md", workspaceDir);
  const skills = loadSkills({
    skillDirs: [join(workspaceDir, "skills"), config.systemSkillsDir],
  });

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
- Current day: ${new Date().toLocaleDateString("en-US", { weekday: "long" })}
- Preferred Timezone: ${userTimezone}
- Current working directory: ${process.cwd()}
- Workspace directory: ${workspaceDir}

Remember: Be concise, helpful, and genuinely yourself.
`);

  return parts.join("\n\n---\n\n");
}
