import { access, copyFile, mkdir, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "./logger";
import {
  DEFAULT_AGENTS_PROMPT,
  DEFAULT_BOOTSTRAP_PROMPT,
  DEFAULT_IDENTITY_PROMPT,
  DEFAULT_SOUL_PROMPT,
  DEFAULT_TOOLS_PROMPT,
  DEFAULT_USER_PROMPT,
} from "./brain";
import { getWorkspaceDir } from "./config";

const SYSTEM_SKILLS = join(import.meta.dirname, "..", "skills");

/**
 * Initialize brain files if they don't exist.
 * BOOTSTRAP.md is only created on fresh install (when no other brain files exist).
 */

const initializedCache = new Set<string>();

export async function initializeBrain({ instanceId }: { instanceId: string }) {
  logger.info({ msg: `Initializing brain for instance: ${instanceId}` });

  if (initializedCache.has(instanceId)) {
    return;
  }

  initializedCache.add(instanceId);

  const brainDir = getWorkspaceDir(instanceId);
  const brainSkillsDir = join(brainDir, "skills");

  const brainFiles = {
    "AGENTS.md": DEFAULT_AGENTS_PROMPT,
    "IDENTITY.md": DEFAULT_IDENTITY_PROMPT,
    "SOUL.md": DEFAULT_SOUL_PROMPT,
    "TOOLS.md": DEFAULT_TOOLS_PROMPT,
    "USER.md": DEFAULT_USER_PROMPT,
  };

  // Ensure brain directory exists
  try {
    await access(brainDir);
  } catch {
    await mkdir(brainDir, { recursive: true });
    logger.info(`Created brain directory for instance: ${instanceId}`);
  }

  // Check if any brain files exist (to determine if this is a fresh install)
  const existingFiles = [];

  for (const file of Object.keys(brainFiles)) {
    try {
      await access(join(brainDir, file));
      existingFiles.push(file);
    } catch {
      // File doesn't exist
    }
  }

  const isFreshInstall = existingFiles.length === 0;

  // Create missing brain files
  for (const [file, content] of Object.entries(brainFiles)) {
    const filePath = join(brainDir, file);

    try {
      await access(filePath);
    } catch {
      await writeFile(filePath, content);
      logger.info(`Created ${file} for instance: ${instanceId}`);
    }
  }

  // Only create BOOTSTRAP.md on fresh install
  const bootstrapPath = join(brainDir, "BOOTSTRAP.md");

  if (isFreshInstall) {
    try {
      await access(bootstrapPath);
    } catch {
      await writeFile(bootstrapPath, DEFAULT_BOOTSTRAP_PROMPT);

      logger.info(
        `Created BOOTSTRAP.md (fresh install) for instance: ${instanceId}`,
      );
    }
  }

  // Copy system skills to brain/skills if they don't exist
  try {
    await access(SYSTEM_SKILLS);

    try {
      await access(brainSkillsDir);
    } catch {
      await mkdir(brainSkillsDir, { recursive: true });
    }

    const systemSkillFiles = (await readdir(SYSTEM_SKILLS)).filter((f) =>
      f.endsWith(".md"),
    );

    for (const skillFile of systemSkillFiles) {
      const destPath = join(brainSkillsDir, skillFile);

      try {
        await access(destPath);
      } catch {
        await copyFile(join(SYSTEM_SKILLS, skillFile), destPath);
        logger.info(`Copied system skill: ${skillFile}`);
      }
    }
  } catch {
    // SYSTEM_SKILLS directory doesn't exist
  }
}
