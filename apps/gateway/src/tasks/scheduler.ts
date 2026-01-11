// apps/gateway/src/lib/tasks/scheduler.ts

import cron, { ScheduledTask } from "node-cron";
import chokidar, { FSWatcher } from "chokidar";
import { basename } from "path";
import { Task } from "./types.js";
import {
  loadTask,
  loadAllTasks,
  saveTask,
  archiveTask,
  listInstances,
} from "./file-utils.js";
import { executeTask } from "./executor.js";
import { dispatch } from "./dispatcher.js";
import { config, getActiveTasksDir, ensureInstanceDirs } from "../config.js";
import { logger } from "../logger.js";
import { readSettings } from "../lib/settings.js";

interface SchedulerState {
  tasks: Map<string, Task>;
  cronJobs: Map<string, ScheduledTask>;
  watchers: Map<string, FSWatcher>;
  pollerInterval: NodeJS.Timeout | null;
  isRunning: boolean;
}

const state: SchedulerState = {
  tasks: new Map(),
  cronJobs: new Map(),
  watchers: new Map(),
  pollerInterval: null,
  isRunning: false,
};

function isPast(isoDate: string): boolean {
  return new Date(isoDate) <= new Date();
}

async function handleTaskExecution(task: Task): Promise<void> {
  try {
    const result = await executeTask(task);

    // Update task metadata
    task.metadata.lastRun = result.executedAt;
    task.metadata.runCount += 1;
    task.metadata.lastError = null;

    // Dispatch result as chat message
    await dispatch(result);

    // Archive one-shot tasks
    if (task.schedule.type === "once") {
      archiveTask(task);
      state.tasks.delete(task.id);
      logger.info({ taskId: task.id }, "One-shot task archived");
    } else {
      saveTask(task);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    task.metadata.lastError = {
      at: new Date().toISOString(),
      message: errorMessage,
    };

    saveTask(task);
    logger.error({ error, taskId: task.id }, "Task execution failed");
  }
}

function scheduleRecurringTask(task: Task): void {
  if (task.schedule.type !== "recurring") return;

  // Cancel existing job if any
  const existingJob = state.cronJobs.get(task.id);

  if (existingJob) {
    existingJob.stop();
  }

  try {
    const settings = readSettings();
    const job = cron.schedule(
      task.schedule.cron,
      () => {
        handleTaskExecution(task);
      },
      {
        timezone: settings.timezone,
      },
    );

    state.cronJobs.set(task.id, job);

    logger.info(
      {
        taskId: task.id,
        cron: task.schedule.cron,
        timezone: settings.timezone,
      },
      "Scheduled recurring task",
    );
  } catch (error) {
    logger.error(
      { error, taskId: task.id, cron: task.schedule.cron },
      "Invalid cron expression",
    );
  }
}

function unscheduleTask(taskId: string): void {
  logger.info({ taskId }, "Unscheduling task");

  const job = state.cronJobs.get(taskId);

  if (job) {
    job.stop();
    state.cronJobs.delete(taskId);
    logger.info({ taskId }, "Stopped and removed cron job");
  } else {
    logger.warn({ taskId }, "No cron job found for task");
  }

  state.tasks.delete(taskId);

  logger.info(
    {
      taskId,
      remainingTasks: state.tasks.size,
      remainingJobs: state.cronJobs.size,
    },
    "Task unscheduled",
  );
}

function handleFileChange(
  instance: string,
  filePath: string,
  eventType: "add" | "change" | "unlink",
): void {
  const fileName = basename(filePath);
  const taskId = fileName.replace(".json", "");
  logger.info(
    { instance, filePath, eventType, taskId, fileName },
    "File change detected",
  );

  if (!taskId) return;

  if (eventType === "unlink") {
    logger.info({ taskId }, "File unlinked, unscheduling task");
    unscheduleTask(taskId);

    return;
  }

  const task = loadTask(instance, taskId);

  if (!task) {
    logger.warn({ taskId, filePath }, "Failed to load task after file change");

    return;
  }

  state.tasks.set(task.id, task);

  if (task.schedule.type === "recurring") {
    scheduleRecurringTask(task);
  }

  logger.debug({ taskId, eventType }, "Task file changed");
}

function setupWatcher(instance: string): void {
  const dir = getActiveTasksDir(instance);
  ensureInstanceDirs(instance);

  const watcher = chokidar.watch(dir, {
    persistent: true,
    ignoreInitial: true,
    ignored: (path, stats) => !!stats?.isFile() && !path.endsWith(".json"),
  });

  watcher
    .on("add", (path) => handleFileChange(instance, path, "add"))
    .on("change", (path) => handleFileChange(instance, path, "change"))
    .on("unlink", (path) => handleFileChange(instance, path, "unlink"))
    .on("error", (error) =>
      logger.error({ error, instance }, "File watcher error"),
    )
    .on("ready", () => logger.info({ instance, dir }, "File watcher ready"));

  state.watchers.set(instance, watcher);
  logger.info({ instance, dir }, "File watcher started");
}

function startPoller(): void {
  state.pollerInterval = setInterval(() => {
    for (const task of state.tasks.values()) {
      if (task.schedule.type === "once" && isPast(task.schedule.at)) {
        logger.info(
          { taskId: task.id, scheduledAt: task.schedule.at },
          "One-shot task due",
        );

        handleTaskExecution(task);
      }
    }
  }, config.pollerIntervalMs);

  logger.info(
    { intervalMs: config.pollerIntervalMs },
    "One-shot poller started",
  );
}

export async function startScheduler({
  defaultInstanceId,
}: {
  defaultInstanceId: string;
}): Promise<void> {
  if (state.isRunning) {
    logger.warn("Scheduler already running");

    return;
  }

  logger.info("Starting scheduler");

  // Ensure default instance exists
  ensureInstanceDirs(defaultInstanceId);

  // Load all instances
  const instances = listInstances();
  console.log("\x1b[33m%s\x1b[0m", "🪵 instances", instances);

  if (instances.length === 0) {
    instances.push(defaultInstanceId);
  }

  // Load tasks and set up watchers for each instance
  for (const instance of instances) {
    const tasks = loadAllTasks(instance);
    logger.info(
      { instance, taskCount: tasks.length },
      "Loaded tasks for instance",
    );

    for (const task of tasks) {
      state.tasks.set(task.id, task);

      if (task.schedule.type === "recurring") {
        scheduleRecurringTask(task);
      }
    }

    setupWatcher(instance);
  }

  // Start poller for one-shot tasks
  startPoller();

  state.isRunning = true;

  logger.info(
    { taskCount: state.tasks.size, instanceCount: instances.length },
    "Scheduler started",
  );
}

export async function stopScheduler(): Promise<void> {
  if (!state.isRunning) return;

  logger.info("Stopping scheduler");

  // Stop all cron jobs
  for (const [_taskId, job] of state.cronJobs) {
    job.stop();
  }
  state.cronJobs.clear();

  // Stop all watchers
  for (const [_instance, watcher] of state.watchers) {
    await watcher.close();
  }
  state.watchers.clear();

  // Stop poller
  if (state.pollerInterval) {
    clearInterval(state.pollerInterval);
    state.pollerInterval = null;
  }

  state.tasks.clear();
  state.isRunning = false;

  logger.info("Scheduler stopped");
}

export function getSchedulerStats(): {
  taskCount: number;
  cronJobCount: number;
  isRunning: boolean;
} {
  return {
    taskCount: state.tasks.size,
    cronJobCount: state.cronJobs.size,
    isRunning: state.isRunning,
  };
}
