/**
 * Cron Tool - pi-coding-agent compatible version
 *
 * Manages gateway cron jobs using the pi tool definition format.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
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
  sourceChannel?: string;
  chatId?: string;
}

interface CronResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

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
    content: [
      {
        type: "text",
        text: `Scheduler is ${stats.isRunning ? "running" : "stopped"}`,
      },
    ],
    details: {
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
    content: [
      {
        type: "text",
        text: `Found ${tasks.length} task(s):\n${JSON.stringify(tasks.map(formatTask), null, 2)}`,
      },
    ],
    details: { tasks: tasks.map(formatTask) },
  };
}

async function handleAdd(
  instance: string,
  input: {
    name?: string;
    cron?: string;
    executionType?: "notification" | "llm";
    executionPayload?: string;
    description?: string;
    sessionId?: string;
  },
  sourceChannel?: string,
  chatId?: string,
): Promise<CronResult> {
  const {
    name,
    cron,
    executionType,
    executionPayload,
    description,
    sessionId,
  } = input;

  if (!name) {
    return {
      content: [{ type: "text", text: "Error: Missing required field: name" }],
      details: { error: true },
    };
  }

  if (!cron) {
    return {
      content: [{ type: "text", text: "Error: Missing required field: cron" }],
      details: { error: true },
    };
  }

  if (!nodeCron.validate(cron)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Invalid cron expression: "${cron}". Use standard cron format (e.g., "0 9 * * *" for 9am daily)`,
        },
      ],
      details: { error: true },
    };
  }

  if (!executionType) {
    return {
      content: [
        { type: "text", text: "Error: Missing required field: executionType" },
      ],
      details: { error: true },
    };
  }

  if (!executionPayload) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Missing required field: executionPayload",
        },
      ],
      details: { error: true },
    };
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
    chatId,
  };

  const task = createTask(taskInput);

  logger.info({ taskId: task.id, name }, "Task created via cron tool");

  return {
    content: [
      { type: "text", text: `Task "${name}" created with ID ${task.id}` },
    ],
    details: { task: formatTask(task) },
  };
}

async function handleUpdate(
  instance: string,
  input: {
    taskId?: string;
    name?: string;
    description?: string;
    cron?: string;
    executionType?: "notification" | "llm";
    executionPayload?: string;
    sessionId?: string;
  },
): Promise<CronResult> {
  const {
    taskId,
    name,
    description,
    cron,
    executionType,
    executionPayload,
    sessionId,
  } = input;

  if (!taskId) {
    return {
      content: [
        { type: "text", text: "Error: Missing required field: taskId" },
      ],
      details: { error: true },
    };
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    return {
      content: [{ type: "text", text: `Error: Task not found: ${taskId}` }],
      details: { error: true },
    };
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
        content: [
          { type: "text", text: `Error: Invalid cron expression: "${cron}"` },
        ],
        details: { error: true },
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
    content: [{ type: "text", text: `Task "${task.name}" updated` }],
    details: { task: formatTask(task) },
  };
}

async function handleRemove(
  instance: string,
  taskId?: string,
): Promise<CronResult> {
  if (!taskId) {
    return {
      content: [
        { type: "text", text: "Error: Missing required field: taskId" },
      ],
      details: { error: true },
    };
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    return {
      content: [{ type: "text", text: `Error: Task not found: ${taskId}` }],
      details: { error: true },
    };
  }

  const deleted = deleteTask(instance, taskId);

  if (!deleted) {
    return {
      content: [
        { type: "text", text: `Error: Failed to delete task: ${taskId}` },
      ],
      details: { error: true },
    };
  }

  logger.info({ taskId }, "Task removed via cron tool");

  return {
    content: [{ type: "text", text: `Task "${task.name}" removed` }],
    details: {},
  };
}

async function handleRun(
  instance: string,
  taskId?: string,
  waitForResult?: boolean,
): Promise<CronResult> {
  if (!taskId) {
    return {
      content: [
        { type: "text", text: "Error: Missing required field: taskId" },
      ],
      details: { error: true },
    };
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    return {
      content: [{ type: "text", text: `Error: Task not found: ${taskId}` }],
      details: { error: true },
    };
  }

  logger.info({ taskId, waitForResult }, "Manual task execution via cron tool");

  if (waitForResult) {
    try {
      const result = await executeTask(task);

      task.metadata.lastRun = result.executedAt;
      task.metadata.runCount += 1;
      task.metadata.lastError = null;
      saveTask(task);

      return {
        content: [
          { type: "text", text: `Task "${task.name}" executed successfully` },
        ],
        details: {
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
        content: [
          {
            type: "text",
            text: `Error: Task execution failed: ${errorMessage}`,
          },
        ],
        details: { error: true },
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
        await dispatch(result);
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
      content: [
        {
          type: "text",
          text: `Task "${task.name}" triggered (running in background)`,
        },
      ],
      details: { taskId: task.id },
    };
  }
}

// Define the parameter schema
const CronParamsSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("status"),
      Type.Literal("list"),
      Type.Literal("add"),
      Type.Literal("update"),
      Type.Literal("remove"),
      Type.Literal("run"),
    ],
    { description: "The operation to perform" },
  ),
  instance: Type.Optional(
    Type.String({ description: "Instance ID (defaults to default instance)" }),
  ),
  taskId: Type.Optional(
    Type.String({ description: "Task ID (required for update/remove/run)" }),
  ),
  name: Type.Optional(
    Type.String({ description: "Task name (required for add)" }),
  ),
  description: Type.Optional(Type.String({ description: "Task description" })),
  cron: Type.Optional(
    Type.String({
      description: "Cron expression (e.g., '0 9 * * *' for 9am daily)",
    }),
  ),
  executionType: Type.Optional(
    Type.Union([Type.Literal("notification"), Type.Literal("llm")], {
      description: "Type of execution (required for add)",
    }),
  ),
  executionPayload: Type.Optional(
    Type.String({
      description:
        "Message for notification, or prompt for llm (required for add)",
    }),
  ),
  waitForResult: Type.Optional(
    Type.Boolean({
      description: "Wait for execution to complete (for run action)",
      default: false,
    }),
  ),
  sessionId: Type.Optional(
    Type.String({
      description: "Session ID to save LLM results to (for llm execution type)",
    }),
  ),
});

type CronParams = Static<typeof CronParamsSchema>;

export function createCronToolDefinition(
  options?: CronToolOptions,
): ToolDefinition<typeof CronParamsSchema> {
  const defaultInstance = options?.instanceId ?? DEFAULT_INSTANCE_ID;
  const sourceChannel = options?.sourceChannel;
  const sourceChatId = options?.chatId;

  return {
    name: "cron",
    label: "Cron",
    description:
      "Manage gateway cron jobs. Both recurring and one time requests. Actions: status (scheduler stats), list (show tasks), add (create task), update (modify task), remove (delete task), run (execute task manually).",
    parameters: CronParamsSchema,
    execute: async (toolCallId, params: CronParams) => {
      const instance = params.instance ?? defaultInstance;

      logger.debug(
        { action: params.action, instance, sourceChannel, sourceChatId },
        "Cron tool invoked",
      );

      let result: CronResult;

      switch (params.action) {
        case "status":
          result = await handleStatus(instance);
          break;
        case "list":
          result = await handleList(instance);
          break;
        case "add":
          result = await handleAdd(
            instance,
            params,
            sourceChannel,
            sourceChatId,
          );
          break;
        case "update":
          result = await handleUpdate(instance, params);
          break;
        case "remove":
          result = await handleRemove(instance, params.taskId);
          break;
        case "run":
          result = await handleRun(
            instance,
            params.taskId,
            params.waitForResult,
          );
          break;
        default:
          result = {
            content: [
              { type: "text", text: `Error: Unknown action: ${params.action}` },
            ],
            details: { error: true },
          };
      }

      return result;
    },
  };
}
