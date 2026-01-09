import { Task, ExecutionResult } from "./types.js";
import { logger } from "../logger.js";
import { generateChat } from "@/chat/service.js";
import { buildSystemPrompt } from "@/chat/prompts.js";

// Additional context for scheduled task execution
function getScheduledTaskContext(): string {
  return `
# Scheduled Task Context
- This is a scheduled task execution (not a live chat)
- Current time: ${new Date().toISOString()}
- Be concise and helpful.
`;
}

export async function executeTask(task: Task): Promise<ExecutionResult> {
  const executedAt = new Date().toISOString();

  logger.info(
    { taskId: task.id, taskName: task.name, type: task.execution.type },
    "Executing task",
  );

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

  const basePrompt = buildSystemPrompt({ instanceId: task.instance });
  const systemPromptOverride =
    basePrompt + "\n\n---\n\n" + getScheduledTaskContext();

  try {
    const result = await generateChat({
      instanceId: task.instance,
      prompt: task.execution.prompt,
      systemPromptOverride,
    });

    logger.info(
      { taskId: task.id, usage: result.usage },
      "LLM execution complete",
    );

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
