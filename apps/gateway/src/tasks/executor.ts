import { Task, ExecutionResult } from "./types.js";
import { logger } from "../logger.js";
import { generateChat } from "../agent/agent-service.js";

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
      chatId: task.chatId,
      sessionId: task.sessionId,
      channels: task.notifications.channels,
    };
  }

  try {
    // Use the agent service which handles session management internally
    const result = await generateChat({
      instanceId: task.instance,
      prompt: task.execution.prompt,
    });

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
      chatId: task.chatId,
      sessionId: task.sessionId,
      channels: task.notifications.channels,
    };
  } catch (error) {
    logger.error({ error, taskId: task.id }, "LLM execution failed");
    throw error;
  }
}
