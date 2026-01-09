import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "fs";
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

const BRAIN_DIR = join(import.meta.dirname, "..", "brain");
const SYSTEM_SKILLS = join(import.meta.dirname, "..", "skills");
const BRAIN_SKILLS_DIR = join(BRAIN_DIR, "skills");

/**
 * Initialize brain files if they don't exist.
 * BOOTSTRAP.md is only created on fresh install (when no other brain files exist).
 */
export function initializeBrain() {
  const brainFiles = {
    "AGENTS.md": DEFAULT_AGENTS_PROMPT,
    "IDENTITY.md": DEFAULT_IDENTITY_PROMPT,
    "SOUL.md": DEFAULT_SOUL_PROMPT,
    "TOOLS.md": DEFAULT_TOOLS_PROMPT,
    "USER.md": DEFAULT_USER_PROMPT,
  };

  // Ensure brain directory exists
  if (!existsSync(BRAIN_DIR)) {
    mkdirSync(BRAIN_DIR, { recursive: true });
    logger.info("Created brain directory");
  }

  // Check if any brain files exist (to determine if this is a fresh install)
  const existingFiles = Object.keys(brainFiles).filter((file) =>
    existsSync(join(BRAIN_DIR, file)),
  );
  const isFreshInstall = existingFiles.length === 0;

  // Create missing brain files
  for (const [file, content] of Object.entries(brainFiles)) {
    const filePath = join(BRAIN_DIR, file);

    if (!existsSync(filePath)) {
      writeFileSync(filePath, content);
      logger.info(`Created ${file}`);
    }
  }

  // Only create BOOTSTRAP.md on fresh install
  const bootstrapPath = join(BRAIN_DIR, "BOOTSTRAP.md");

  if (isFreshInstall && !existsSync(bootstrapPath)) {
    writeFileSync(bootstrapPath, DEFAULT_BOOTSTRAP_PROMPT);
    logger.info("Created BOOTSTRAP.md (fresh install)");
  }

  // Copy system skills to brain/skills if they don't exist
  if (existsSync(SYSTEM_SKILLS)) {
    if (!existsSync(BRAIN_SKILLS_DIR)) {
      mkdirSync(BRAIN_SKILLS_DIR, { recursive: true });
    }

    const systemSkillFiles = readdirSync(SYSTEM_SKILLS).filter((f) =>
      f.endsWith(".md"),
    );

    for (const skillFile of systemSkillFiles) {
      const destPath = join(BRAIN_SKILLS_DIR, skillFile);

      if (!existsSync(destPath)) {
        copyFileSync(join(SYSTEM_SKILLS, skillFile), destPath);
        logger.info(`Copied system skill: ${skillFile}`);
      }
    }
  }
}
