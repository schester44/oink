import { Task, ExecutionResult } from "./types.js";
import { logger } from "../logger.js";
import { generateChat } from "@/chat/service.js";
import { buildSystemPrompt } from "@/chat/prompts.js";
import { readSettings } from "@/lib/settings.js";
import { SessionManager } from "../session/index.js";

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

  const settings = readSettings();
  const basePrompt = buildSystemPrompt({
    instanceId: task.instance,
    userTimezone: settings.timezone,
  });
  const systemPromptOverride =
    basePrompt + "\n\n---\n\n" + getScheduledTaskContext();

  // Only create session manager if task has a sessionId configured
  const session = task.sessionId
    ? new SessionManager({
        sessionId: task.sessionId,
        instanceId: task.instance,
      })
    : null;

  try {
    // Save the prompt as a user message if session is configured
    if (session) {
      session.appendStructuredMessage({
        role: "user",
        parts: [{ type: "text", text: task.execution.prompt }],
      });
    }

    const result = await generateChat({
      instanceId: task.instance,
      prompt: task.execution.prompt,
      systemPromptOverride,
    });

    // Save the response as an assistant message if session is configured
    if (session) {
      session.appendStructuredMessage({
        role: "assistant",
        parts: [{ type: "text", text: result.text }],
        usage: result.usage
          ? {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens:
                result.usage.inputTokens + result.usage.outputTokens,
            }
          : undefined,
      });
    }

    logger.info(
      { taskId: task.id, sessionId: task.sessionId, usage: result.usage },
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
