// apps/gateway/src/lib/tasks/executor.ts

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import { Task, ExecutionResult } from "./types.js";
import { config, getBrainDir } from "../config.js";
import { logger } from "../logger.js";

function loadTemplate(filename: string, brainDir: string): string | null {
  const path = join(brainDir, filename);
  if (!existsSync(path)) return null;

  try {
    const contents = readFileSync(path, "utf-8");
    const { content } = matter(contents);
    return content;
  } catch (error) {
    logger.error({ error, filename }, "Error loading template");
    return null;
  }
}

function buildSystemPrompt(instance: string): string {
  const brainDir = getBrainDir(config, instance);

  const parts: string[] = [];

  // Load brain files in order
  const files = ["SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md", "TOOLS.md"];
  for (const file of files) {
    const content = loadTemplate(file, brainDir);
    if (content) {
      parts.push(content);
    }
  }

  // Add runtime context
  parts.push(`
# Context
- Current time: ${new Date().toISOString()}
- This is a scheduled task execution (not a live chat)
- Be concise and helpful.
`);

  return parts.join("\n\n---\n\n");
}

export async function executeTask(task: Task): Promise<ExecutionResult> {
  const executedAt = new Date().toISOString();

  logger.info({ taskId: task.id, taskName: task.name, type: task.execution.type }, "Executing task");

  if (task.execution.type === "notification") {
    return {
      taskId: task.id,
      taskName: task.name,
      instance: task.instance,
      output: task.execution.message,
      executedAt,
      type: "notification",
    };
  }

  // LLM execution
  const systemPrompt = buildSystemPrompt(task.instance);

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-5-20250514"),
      system: systemPrompt,
      prompt: task.execution.prompt,
    });

    logger.info({ taskId: task.id, usage: result.usage }, "LLM execution complete");

    return {
      taskId: task.id,
      taskName: task.name,
      instance: task.instance,
      output: result.text,
      executedAt,
      type: "llm",
    };
  } catch (error) {
    logger.error({ error, taskId: task.id }, "LLM execution failed");
    throw error;
  }
}
