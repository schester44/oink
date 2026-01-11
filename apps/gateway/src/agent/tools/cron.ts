import { tool } from "ai";
import { z } from "zod";
import nodeCron from "node-cron";
import { logger } from "../../logger.js";
import { DEFAULT_INSTANCE_ID } from "../../config.js";
import {
  createTask,
  loadTask,
  saveTask,
  deleteTask,
  loadAllTasks,
  type CreateTaskInput,
} from "../../tasks/file-utils.js";
import { executeTask } from "../../tasks/executor.js";
import { getSchedulerStats } from "../../tasks/scheduler.js";
import { dispatch } from "../../tasks/dispatcher.js";
import type { Task, TaskExecution } from "../../tasks/types.js";

interface CronToolOptions {
  instanceId?: string;
  /** The source channel for notifications (e.g., "telegram", "websocket") */
  sourceChannel?: string;
}

interface CronResult {
  stdout?: string;
  stderr?: string;
  data?: unknown;
}

const actionSchema = z.enum([
  "status",
  "list",
  "add",
  "update",
  "remove",
  "run",
]);

const inputSchema = z.object({
  action: actionSchema.describe("The operation to perform"),
  instance: z
    .string()
    .optional()
    .describe("Instance ID (defaults to default instance)"),
  taskId: z
    .string()
    .optional()
    .describe("Task ID (required for update/remove/run)"),
  name: z.string().optional().describe("Task name (required for add)"),
  description: z.string().optional().describe("Task description"),
  cron: z
    .string()
    .optional()
    .describe(
      "Cron expression (e.g., '0 9 * * *' for 9am daily). Use precision for one time tasks eg 47 22 9 1 *",
    ),
  executionType: z
    .enum(["notification", "llm"])
    .optional()
    .describe("Type of execution (required for add)"),
  executionPayload: z
    .string()
    .optional()
    .describe("Message for notification, or prompt for llm (required for add)"),
  waitForResult: z
    .boolean()
    .optional()
    .default(false)
    .describe("Wait for execution to complete (for run action)"),
  sessionId: z
    .string()
    .optional()
    .describe("Session ID to save LLM results to (for llm execution type)"),
});

type CronInput = z.infer<typeof inputSchema>;

function formatTask(task: Task): object {
  return {
    id: task.id,
    name: task.name,
    description: task.description,
    schedule: task.schedule,
    execution: task.execution,
    sessionId: task.sessionId,
    lastRun: task.metadata.lastRun,
    runCount: task.metadata.runCount,
    lastError: task.metadata.lastError,
  };
}

async function handleStatus(instance: string): Promise<CronResult> {
  const stats = getSchedulerStats();
  const tasks = loadAllTasks(instance);

  return {
    stdout: `Scheduler is ${stats.isRunning ? "running" : "stopped"}`,
    data: {
      isRunning: stats.isRunning,
      taskCount: stats.taskCount,
      cronJobCount: stats.cronJobCount,
      instanceTaskCount: tasks.length,
    },
  };
}

async function handleList(instance: string): Promise<CronResult> {
  const tasks = loadAllTasks(instance);

  return {
    stdout: `Found ${tasks.length} task(s)`,
    data: tasks.map(formatTask),
  };
}

async function handleAdd(
  instance: string,
  input: CronInput,
  sourceChannel?: string,
): Promise<CronResult> {
  const { name, cron, executionType, executionPayload, description, sessionId } = input;

  if (!name) {
    return { stderr: "Missing required field: name" };
  }

  if (!cron) {
    return { stderr: "Missing required field: cron" };
  }

  if (!nodeCron.validate(cron)) {
    return {
      stderr: `Invalid cron expression: "${cron}". Use standard cron format (e.g., "0 9 * * *" for 9am daily, "47 22 9 1 *" for specific date/time)`,
    };
  }

  if (!executionType) {
    return { stderr: "Missing required field: executionType" };
  }

  if (!executionPayload) {
    return { stderr: "Missing required field: executionPayload" };
  }

  const execution: TaskExecution =
    executionType === "notification"
      ? { type: "notification", message: executionPayload }
      : { type: "llm", prompt: executionPayload };

  const taskInput: CreateTaskInput = {
    instance,
    name,
    description,
    schedule: { type: "recurring", cron },
    execution,
    sessionId,
    channels: sourceChannel ? [sourceChannel] : undefined,
  };

  const task = createTask(taskInput);

  logger.info({ taskId: task.id, name }, "Task created via cron tool");

  return {
    stdout: `Task "${name}" created with ID ${task.id}`,
    data: formatTask(task),
  };
}

async function handleUpdate(
  instance: string,
  input: CronInput,
): Promise<CronResult> {
  const { taskId, name, description, cron, executionType, executionPayload, sessionId } =
    input;

  if (!taskId) {
    return { stderr: "Missing required field: taskId" };
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    return { stderr: `Task not found: ${taskId}` };
  }

  if (name !== undefined) {
    task.name = name;
  }

  if (description !== undefined) {
    task.description = description;
  }

  if (cron !== undefined && task.schedule.type === "recurring") {
    if (!nodeCron.validate(cron)) {
      return {
        stderr: `Invalid cron expression: "${cron}". Use standard cron format (e.g., "0 9 * * *" for 9am daily, "47 22 9 1 *" for specific date/time)`,
      };
    }
    task.schedule.cron = cron;
  }

  if (executionType !== undefined && executionPayload !== undefined) {
    task.execution =
      executionType === "notification"
        ? { type: "notification", message: executionPayload }
        : { type: "llm", prompt: executionPayload };
  }

  if (sessionId !== undefined) {
    task.sessionId = sessionId;
  }

  saveTask(task);

  logger.info({ taskId }, "Task updated via cron tool");

  return {
    stdout: `Task "${task.name}" updated`,
    data: formatTask(task),
  };
}

async function handleRemove(
  instance: string,
  input: CronInput,
): Promise<CronResult> {
  const { taskId } = input;

  if (!taskId) {
    return { stderr: "Missing required field: taskId" };
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    return { stderr: `Task not found: ${taskId}` };
  }

  const deleted = deleteTask(instance, taskId);

  if (!deleted) {
    return { stderr: `Failed to delete task: ${taskId}` };
  }

  logger.info({ taskId }, "Task removed via cron tool");

  return {
    stdout: `Task "${task.name}" removed`,
  };
}

async function handleRun(
  instance: string,
  input: CronInput,
): Promise<CronResult> {
  const { taskId, waitForResult } = input;

  if (!taskId) {
    return { stderr: "Missing required field: taskId" };
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    return { stderr: `Task not found: ${taskId}` };
  }

  logger.info({ taskId, waitForResult }, "Manual task execution via cron tool");

  if (waitForResult) {
    try {
      const result = await executeTask(task);

      // Update task metadata
      task.metadata.lastRun = result.executedAt;
      task.metadata.runCount += 1;
      task.metadata.lastError = null;
      saveTask(task);

      return {
        stdout: `Task "${task.name}" executed successfully`,
        data: {
          output: result.output,
          executedAt: result.executedAt,
          type: result.type,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      task.metadata.lastError = {
        at: new Date().toISOString(),
        message: errorMessage,
      };

      saveTask(task);

      return {
        stderr: `Task execution failed: ${errorMessage}`,
      };
    }
  } else {
    // Fire and forget
    executeTask(task)
      .then(async (result) => {
        task.metadata.lastRun = result.executedAt;
        task.metadata.runCount += 1;
        task.metadata.lastError = null;
        saveTask(task);
        await dispatch(result, task.notifications.channels);
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        task.metadata.lastError = {
          at: new Date().toISOString(),
          message: errorMessage,
        };

        saveTask(task);
        logger.error({ error, taskId }, "Background task execution failed");
      });

    return {
      stdout: `Task "${task.name}" triggered (running in background)`,
      data: { taskId: task.id },
    };
  }
}

export function createCronTool(options?: CronToolOptions) {
  const defaultInstance = options?.instanceId ?? DEFAULT_INSTANCE_ID;
  const sourceChannel = options?.sourceChannel;

  return tool({
    description:
      "Manage gateway cron jobs. Both recurring and one time requests. Actions: status (scheduler stats), list (show tasks), add (create task), update (modify task), remove (delete task), run (execute task manually).",
    inputSchema,
    execute: async (input) => {
      const instance = input.instance ?? defaultInstance;

      logger.debug({ action: input.action, instance, sourceChannel }, "Cron tool invoked");

      switch (input.action) {
        case "status":
          return handleStatus(instance);
        case "list":
          return handleList(instance);
        case "add":
          return handleAdd(instance, input, sourceChannel);
        case "update":
          return handleUpdate(instance, input);
        case "remove":
          return handleRemove(instance, input);
        case "run":
          return handleRun(instance, input);
        default:
          return { stderr: `Unknown action: ${input.action}` };
      }
    },
  });
}
