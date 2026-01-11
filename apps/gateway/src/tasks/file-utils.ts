// apps/gateway/src/lib/tasks/file-utils.ts

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { Task } from "./types.js";
import {
  config,
  getActiveTasksDir,
  getArchiveTasksDir,
  ensureInstanceDirs,
} from "../config.js";
import { logger } from "../logger.js";

export function generateTaskId(): string {
  return uuidv4();
}

export function getTaskFilePath(instance: string, taskId: string): string {
  return join(getActiveTasksDir(instance), `${taskId}.json`);
}

export function loadTask(instance: string, taskId: string): Task | null {
  const filePath = getTaskFilePath(instance, taskId);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");

    return JSON.parse(content) as Task;
  } catch (error) {
    logger.error({ error, filePath }, "Failed to load task");

    return null;
  }
}

export function saveTask(task: Task): void {
  ensureInstanceDirs(task.instance);
  const filePath = getTaskFilePath(task.instance, task.id);
  writeFileSync(filePath, JSON.stringify(task, null, 2));
  logger.debug({ taskId: task.id, filePath }, "Task saved");
}

export function deleteTask(instance: string, taskId: string): boolean {
  const filePath = getTaskFilePath(instance, taskId);

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    unlinkSync(filePath);
    logger.debug({ taskId, filePath }, "Task deleted");

    return true;
  } catch (error) {
    logger.error({ error, taskId, filePath }, "Failed to delete task");

    return false;
  }
}

export function archiveTask(task: Task): void {
  const sourcePath = getTaskFilePath(task.instance, task.id);
  const archiveDir = getArchiveTasksDir(task.instance);
  const destPath = join(archiveDir, `${task.id}.json`);

  ensureInstanceDirs(task.instance);

  // Update task with archive timestamp
  const archivedTask = {
    ...task,
    metadata: {
      ...task.metadata,
      archivedAt: new Date().toISOString(),
    },
  };

  writeFileSync(destPath, JSON.stringify(archivedTask, null, 2));

  if (existsSync(sourcePath)) {
    unlinkSync(sourcePath);
  }

  logger.debug({ taskId: task.id, destPath }, "Task archived");
}

export function loadAllTasks(instance: string): Task[] {
  const dir = getActiveTasksDir(instance);

  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const tasks: Task[] = [];

  for (const file of files) {
    const taskId = file.replace(".json", "");
    const task = loadTask(instance, taskId);

    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}

export function listInstances(): string[] {
  const instancesDir = join(config.dataDir, "instances");

  if (!existsSync(instancesDir)) {
    return [];
  }

  return readdirSync(instancesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export interface CreateTaskInput {
  instance?: string;
  name: string;
  description?: string;
  schedule: Task["schedule"];
  execution: Task["execution"];
  channels?: string[];
  createdBy?: string;
  sessionId?: string;
  chatId?: string;
}

export function createTask(input: CreateTaskInput): Task {
  const id = generateTaskId();
  const instance = input.instance || config.defaultInstance;

  const task: Task = {
    id,
    instance,
    name: input.name,
    description: input.description || "",
    schedule: input.schedule,
    execution: input.execution,
    notifications: {
      channels: input.channels || ["websocket"],
      priority: "normal",
    },
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy || "api",
      lastRun: null,
      runCount: 0,
      lastError: null,
    },
    sessionId: input.sessionId,
    chatId: input.chatId,
  };

  saveTask(task);

  return task;
}
