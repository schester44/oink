# Scheduled Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a file-based cron system in the gateway that executes scheduled tasks (reminders, LLM prompts) and delivers notifications via WebSocket.

**Architecture:** Scheduler watches JSON task files, triggers execution via node-cron (recurring) or 1-minute poller (one-shots). Executor runs notifications or LLM prompts with full brain context. Dispatcher routes output to connected WebSocket clients scoped by instance.

**Tech Stack:** Node.js 22, TypeScript, node-cron, socket.io, chokidar (file watching), ai-sdk/anthropic, Pino logging

---

## Task 1: Add Dependencies

**Files:**
- Modify: `apps/gateway/package.json`

**Step 1: Add required dependencies**

```bash
cd /Users/schester/work/oink/.worktrees/scheduled-tasks/apps/gateway
yarn add node-cron socket.io chokidar gray-matter ai @ai-sdk/anthropic uuid
yarn add -D @types/node-cron @types/uuid
```

**Step 2: Verify installation**

Run: `yarn typecheck`
Expected: PASS (no new errors)

**Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore(gateway): add scheduled tasks dependencies"
```

---

## Task 2: Define Task Types

**Files:**
- Create: `apps/gateway/src/lib/tasks/types.ts`

**Step 1: Create the types file**

```typescript
// apps/gateway/src/lib/tasks/types.ts

export interface RecurringSchedule {
  type: "recurring";
  cron: string;
}

export interface OnceSchedule {
  type: "once";
  at: string; // ISO 8601 timestamp
}

export type TaskSchedule = RecurringSchedule | OnceSchedule;

export interface NotificationExecution {
  type: "notification";
  message: string;
}

export interface LLMExecution {
  type: "llm";
  prompt: string;
}

export type TaskExecution = NotificationExecution | LLMExecution;

export interface TaskNotifications {
  channels: string[];
  priority: "normal" | "high";
}

export interface TaskMetadata {
  createdAt: string;
  createdBy: string;
  lastRun: string | null;
  runCount: number;
  lastError: { at: string; message: string } | null;
}

export interface Task {
  id: string;
  instance: string;
  name: string;
  description: string;
  schedule: TaskSchedule;
  execution: TaskExecution;
  notifications: TaskNotifications;
  metadata: TaskMetadata;
}

export interface ExecutionResult {
  taskId: string;
  taskName: string;
  instance: string;
  output: string;
  executedAt: string;
  type: "notification" | "llm";
}
```

**Step 2: Verify types compile**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/types.ts
git commit -m "feat(gateway): add task type definitions"
```

---

## Task 3: Create Config Module

**Files:**
- Create: `apps/gateway/src/lib/config.ts`

**Step 1: Create config file**

```typescript
// apps/gateway/src/lib/config.ts

import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export interface GatewayConfig {
  dataDir: string;
  defaultInstance: string;
  pollerIntervalMs: number;
  wsPort: number;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createConfig(): GatewayConfig {
  const dataDir = process.env.GATEWAY_DATA_DIR || join(process.cwd(), "data");

  return {
    dataDir,
    defaultInstance: process.env.GATEWAY_DEFAULT_INSTANCE || "default",
    pollerIntervalMs: parseInt(process.env.GATEWAY_POLLER_INTERVAL_MS || "60000", 10),
    wsPort: parseInt(process.env.GATEWAY_WS_PORT || "3001", 10),
  };
}

export function getInstanceDir(config: GatewayConfig, instance: string): string {
  return join(config.dataDir, "instances", instance);
}

export function getTasksDir(config: GatewayConfig, instance: string): string {
  return join(getInstanceDir(config, instance), "tasks");
}

export function getActiveTasksDir(config: GatewayConfig, instance: string): string {
  return join(getTasksDir(config, instance), "active");
}

export function getArchiveTasksDir(config: GatewayConfig, instance: string): string {
  return join(getTasksDir(config, instance), "archive");
}

export function getBrainDir(config: GatewayConfig, instance: string): string {
  return join(getInstanceDir(config, instance), "brain");
}

export function ensureInstanceDirs(config: GatewayConfig, instance: string): void {
  ensureDir(getActiveTasksDir(config, instance));
  ensureDir(getArchiveTasksDir(config, instance));
  ensureDir(getBrainDir(config, instance));
}

export const config = createConfig();
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/config.ts
git commit -m "feat(gateway): add config module with directory helpers"
```

---

## Task 4: Create Task File Utilities

**Files:**
- Create: `apps/gateway/src/lib/tasks/file-utils.ts`

**Step 1: Create file utilities**

```typescript
// apps/gateway/src/lib/tasks/file-utils.ts

import { readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { Task } from "./types.js";
import { config, getActiveTasksDir, getArchiveTasksDir, ensureInstanceDirs } from "../config.js";
import { logger } from "../logger.js";

export function generateTaskId(): string {
  return uuidv4();
}

export function getTaskFilePath(instance: string, taskId: string): string {
  return join(getActiveTasksDir(config, instance), `${taskId}.json`);
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
  ensureInstanceDirs(config, task.instance);
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
  const archiveDir = getArchiveTasksDir(config, task.instance);
  const destPath = join(archiveDir, `${task.id}.json`);

  ensureInstanceDirs(config, task.instance);

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
  const dir = getActiveTasksDir(config, instance);

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
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/file-utils.ts
git commit -m "feat(gateway): add task file utilities"
```

---

## Task 5: Create Task Executor

**Files:**
- Create: `apps/gateway/src/lib/tasks/executor.ts`

**Step 1: Create executor**

```typescript
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
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/executor.ts
git commit -m "feat(gateway): add task executor with LLM support"
```

---

## Task 6: Create Dispatcher

**Files:**
- Create: `apps/gateway/src/lib/tasks/dispatcher.ts`

**Step 1: Create dispatcher**

```typescript
// apps/gateway/src/lib/tasks/dispatcher.ts

import type { Server as SocketServer } from "socket.io";
import { ExecutionResult } from "./types.js";
import { logger } from "../logger.js";

export interface ConnectedClient {
  socketId: string;
  instance: string;
  connectedAt: string;
}

export interface Channel {
  name: string;
  isAvailable: (instance: string) => boolean;
  send: (result: ExecutionResult) => Promise<boolean>;
}

// Client registry
const clients = new Map<string, ConnectedClient>();

export function registerClient(socketId: string, instance: string): void {
  clients.set(socketId, {
    socketId,
    instance,
    connectedAt: new Date().toISOString(),
  });
  logger.info({ socketId, instance }, "Client registered");
}

export function unregisterClient(socketId: string): void {
  const client = clients.get(socketId);
  if (client) {
    clients.delete(socketId);
    logger.info({ socketId, instance: client.instance }, "Client unregistered");
  }
}

export function getClientsForInstance(instance: string): ConnectedClient[] {
  return Array.from(clients.values()).filter((c) => c.instance === instance);
}

export function getConnectedClientCount(): number {
  return clients.size;
}

// Dispatcher
let io: SocketServer | null = null;

export function setSocketServer(server: SocketServer): void {
  io = server;
}

function createWebSocketChannel(): Channel {
  return {
    name: "websocket",
    isAvailable: (instance: string) => getClientsForInstance(instance).length > 0,
    send: async (result: ExecutionResult) => {
      if (!io) {
        logger.warn("WebSocket server not initialized");
        return false;
      }

      const instanceClients = getClientsForInstance(result.instance);
      if (instanceClients.length === 0) {
        logger.debug({ instance: result.instance }, "No clients connected for instance");
        return false;
      }

      for (const client of instanceClients) {
        io.to(client.socketId).emit("scheduled-task", {
          type: "scheduled-task",
          ...result,
        });
      }

      logger.info(
        { taskId: result.taskId, instance: result.instance, clientCount: instanceClients.length },
        "Dispatched to WebSocket clients"
      );

      return true;
    },
  };
}

const channels: Channel[] = [createWebSocketChannel()];

export async function dispatch(result: ExecutionResult, taskChannels?: string[]): Promise<void> {
  const channelsToUse = taskChannels || ["websocket"];

  for (const channelName of channelsToUse) {
    const channel = channels.find((c) => c.name === channelName);
    if (!channel) {
      logger.warn({ channelName }, "Unknown channel");
      continue;
    }

    if (!channel.isAvailable(result.instance)) {
      logger.debug({ channelName, instance: result.instance }, "Channel not available");
      continue;
    }

    const success = await channel.send(result);
    if (success) {
      logger.debug({ channelName }, "Dispatch successful");
      return; // Stop on first success (unless high priority - future feature)
    }
  }

  logger.warn({ taskId: result.taskId }, "No channels available for dispatch");
}
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/dispatcher.ts
git commit -m "feat(gateway): add task dispatcher with WebSocket channel"
```

---

## Task 7: Create Scheduler

**Files:**
- Create: `apps/gateway/src/lib/tasks/scheduler.ts`

**Step 1: Create scheduler**

```typescript
// apps/gateway/src/lib/tasks/scheduler.ts

import cron, { ScheduledTask } from "node-cron";
import chokidar, { FSWatcher } from "chokidar";
import { join } from "path";
import { Task } from "./types.js";
import { loadTask, loadAllTasks, saveTask, archiveTask, listInstances } from "./file-utils.js";
import { executeTask } from "./executor.js";
import { dispatch } from "./dispatcher.js";
import { config, getActiveTasksDir, ensureInstanceDirs } from "../config.js";
import { logger } from "../logger.js";

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

    // Dispatch result
    await dispatch(result, task.notifications.channels);

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
    const job = cron.schedule(task.schedule.cron, () => {
      handleTaskExecution(task);
    });

    state.cronJobs.set(task.id, job);
    logger.info({ taskId: task.id, cron: task.schedule.cron }, "Scheduled recurring task");
  } catch (error) {
    logger.error({ error, taskId: task.id, cron: task.schedule.cron }, "Invalid cron expression");
  }
}

function unscheduleTask(taskId: string): void {
  const job = state.cronJobs.get(taskId);
  if (job) {
    job.stop();
    state.cronJobs.delete(taskId);
    logger.debug({ taskId }, "Unscheduled task");
  }
  state.tasks.delete(taskId);
}

function handleFileChange(instance: string, filePath: string, eventType: "add" | "change" | "unlink"): void {
  const taskId = filePath.split("/").pop()?.replace(".json", "");
  if (!taskId) return;

  if (eventType === "unlink") {
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
  const dir = getActiveTasksDir(config, instance);
  ensureInstanceDirs(config, instance);

  const watcher = chokidar.watch(join(dir, "*.json"), {
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on("add", (path) => handleFileChange(instance, path, "add"))
    .on("change", (path) => handleFileChange(instance, path, "change"))
    .on("unlink", (path) => handleFileChange(instance, path, "unlink"));

  state.watchers.set(instance, watcher);
  logger.info({ instance, dir }, "File watcher started");
}

function startPoller(): void {
  state.pollerInterval = setInterval(() => {
    const now = new Date();

    for (const task of state.tasks.values()) {
      if (task.schedule.type === "once" && isPast(task.schedule.at)) {
        logger.info({ taskId: task.id, scheduledAt: task.schedule.at }, "One-shot task due");
        handleTaskExecution(task);
      }
    }
  }, config.pollerIntervalMs);

  logger.info({ intervalMs: config.pollerIntervalMs }, "One-shot poller started");
}

export async function startScheduler(): Promise<void> {
  if (state.isRunning) {
    logger.warn("Scheduler already running");
    return;
  }

  logger.info("Starting scheduler");

  // Ensure default instance exists
  ensureInstanceDirs(config, config.defaultInstance);

  // Load all instances
  const instances = listInstances();
  if (instances.length === 0) {
    instances.push(config.defaultInstance);
  }

  // Load tasks and set up watchers for each instance
  for (const instance of instances) {
    const tasks = loadAllTasks(instance);
    logger.info({ instance, taskCount: tasks.length }, "Loaded tasks for instance");

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
  logger.info({ taskCount: state.tasks.size, instanceCount: instances.length }, "Scheduler started");
}

export async function stopScheduler(): Promise<void> {
  if (!state.isRunning) return;

  logger.info("Stopping scheduler");

  // Stop all cron jobs
  for (const [taskId, job] of state.cronJobs) {
    job.stop();
  }
  state.cronJobs.clear();

  // Stop all watchers
  for (const [instance, watcher] of state.watchers) {
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

export function getSchedulerStats(): { taskCount: number; cronJobCount: number; isRunning: boolean } {
  return {
    taskCount: state.tasks.size,
    cronJobCount: state.cronJobs.size,
    isRunning: state.isRunning,
  };
}
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/scheduler.ts
git commit -m "feat(gateway): add task scheduler with cron and file watching"
```

---

## Task 8: Create WebSocket Server

**Files:**
- Create: `apps/gateway/src/lib/websocket.ts`

**Step 1: Create WebSocket server**

```typescript
// apps/gateway/src/lib/websocket.ts

import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { registerClient, unregisterClient, setSocketServer, getConnectedClientCount } from "./tasks/dispatcher.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

let httpServer: ReturnType<typeof createServer> | null = null;
let io: SocketServer | null = null;

export function startWebSocketServer(): void {
  httpServer = createServer();

  io = new SocketServer(httpServer, {
    cors: {
      origin: "*", // Configure appropriately for production
      methods: ["GET", "POST"],
    },
  });

  setSocketServer(io);

  io.on("connection", (socket) => {
    const instance = (socket.handshake.query.instance as string) || config.defaultInstance;

    registerClient(socket.id, instance);

    socket.on("disconnect", () => {
      unregisterClient(socket.id);
    });

    // Allow clients to switch instances
    socket.on("switch-instance", (newInstance: string) => {
      unregisterClient(socket.id);
      registerClient(socket.id, newInstance);
      socket.emit("instance-switched", { instance: newInstance });
    });

    // Ping/pong for connection health
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });
  });

  httpServer.listen(config.wsPort, () => {
    logger.info({ port: config.wsPort }, "WebSocket server started");
  });
}

export function stopWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (io) {
      io.close(() => {
        logger.info("WebSocket server closed");
        io = null;
        httpServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function getWebSocketStats(): { connectedClients: number; port: number } {
  return {
    connectedClients: getConnectedClientCount(),
    port: config.wsPort,
  };
}
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/websocket.ts
git commit -m "feat(gateway): add WebSocket server with instance scoping"
```

---

## Task 9: Create Tasks Index Export

**Files:**
- Create: `apps/gateway/src/lib/tasks/index.ts`

**Step 1: Create index file**

```typescript
// apps/gateway/src/lib/tasks/index.ts

export * from "./types.js";
export * from "./file-utils.js";
export * from "./executor.js";
export * from "./dispatcher.js";
export * from "./scheduler.js";
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/index.ts
git commit -m "feat(gateway): add tasks module index"
```

---

## Task 10: Update Gateway Entry Point

**Files:**
- Modify: `apps/gateway/src/index.ts`

**Step 1: Read current file**

Review the current `apps/gateway/src/index.ts` to understand the structure.

**Step 2: Update entry point**

```typescript
// apps/gateway/src/index.ts

import { logger } from "./lib/logger.js";
import { startScheduler, stopScheduler, getSchedulerStats } from "./lib/tasks/scheduler.js";
import { startWebSocketServer, stopWebSocketServer, getWebSocketStats } from "./lib/websocket.js";

async function startGateway() {
  logger.info("Starting Oink Gateway");

  // Start WebSocket server
  startWebSocketServer();

  // Start scheduler
  await startScheduler();

  // Log stats periodically
  setInterval(() => {
    const schedulerStats = getSchedulerStats();
    const wsStats = getWebSocketStats();
    logger.debug({ scheduler: schedulerStats, websocket: wsStats }, "Gateway stats");
  }, 60000);

  logger.info("Oink Gateway started successfully");
}

async function shutdown() {
  logger.info("Shutting down gateway");

  await stopScheduler();
  await stopWebSocketServer();

  logger.info("Gateway shutdown complete");
  process.exit(0);
}

// Graceful shutdown handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Global error handlers
process.on("uncaughtException", (error) => {
  logger.error({ error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  process.exit(1);
});

// Start the gateway
startGateway().catch((error) => {
  logger.error({ error }, "Failed to start gateway");
  process.exit(1);
});
```

**Step 3: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/gateway/src/index.ts
git commit -m "feat(gateway): integrate scheduler and WebSocket into gateway startup"
```

---

## Task 11: Create Sample Task for Testing

**Files:**
- Create: `apps/gateway/data/instances/default/tasks/active/test-task.json`

**Step 1: Create data directories**

```bash
mkdir -p apps/gateway/data/instances/default/tasks/active
mkdir -p apps/gateway/data/instances/default/tasks/archive
mkdir -p apps/gateway/data/instances/default/brain
```

**Step 2: Create test task**

Create `apps/gateway/data/instances/default/tasks/active/test-task.json`:

```json
{
  "id": "test-task",
  "instance": "default",
  "name": "Test Notification",
  "description": "A test task to verify the scheduler works",
  "schedule": {
    "type": "once",
    "at": "2099-01-01T00:00:00Z"
  },
  "execution": {
    "type": "notification",
    "message": "Hello from the scheduler!"
  },
  "notifications": {
    "channels": ["websocket"],
    "priority": "normal"
  },
  "metadata": {
    "createdAt": "2025-01-09T00:00:00Z",
    "createdBy": "manual",
    "lastRun": null,
    "runCount": 0,
    "lastError": null
  }
}
```

**Step 3: Add data directory to gitignore**

Add to `apps/gateway/.gitignore`:

```
data/
```

**Step 4: Commit gitignore**

```bash
echo "data/" >> apps/gateway/.gitignore
git add apps/gateway/.gitignore
git commit -m "chore(gateway): ignore data directory"
```

---

## Task 12: Test Gateway Startup

**Step 1: Build the gateway**

```bash
cd /Users/schester/work/oink/.worktrees/scheduled-tasks
yarn workspace @oink/gateway build
```

Expected: Build succeeds

**Step 2: Run the gateway**

```bash
cd apps/gateway
yarn dev
```

Expected output should include:
- "Starting Oink Gateway"
- "WebSocket server started" with port
- "Loaded tasks for instance"
- "Scheduler started"
- "Oink Gateway started successfully"

**Step 3: Verify with curl or wscat**

In another terminal:
```bash
# Check WebSocket is listening
curl -i http://localhost:3001/socket.io/?EIO=4&transport=polling
```

Expected: Should return Socket.IO handshake response

**Step 4: Commit any fixes if needed**

---

## Task 13: Add Task Creation Helper Function

**Files:**
- Modify: `apps/gateway/src/lib/tasks/file-utils.ts`

**Step 1: Add createTask function**

Add to the end of `file-utils.ts`:

```typescript
export interface CreateTaskInput {
  instance?: string;
  name: string;
  description?: string;
  schedule: Task["schedule"];
  execution: Task["execution"];
  channels?: string[];
  createdBy?: string;
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
  };

  saveTask(task);
  return task;
}
```

**Step 2: Verify compilation**

Run: `yarn typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/gateway/src/lib/tasks/file-utils.ts
git commit -m "feat(gateway): add createTask helper function"
```

---

## Summary

After completing all tasks, you will have:

1. **Types** (`types.ts`) - Task schema definitions
2. **Config** (`config.ts`) - Directory paths and environment config
3. **File Utils** (`file-utils.ts`) - CRUD operations for task files
4. **Executor** (`executor.ts`) - Runs tasks (notification or LLM)
5. **Dispatcher** (`dispatcher.ts`) - Routes results to WebSocket clients
6. **Scheduler** (`scheduler.ts`) - Cron jobs, file watching, one-shot poller
7. **WebSocket** (`websocket.ts`) - Socket.IO server with instance scoping
8. **Entry Point** (`index.ts`) - Wires everything together

The system is ready to:
- Load tasks from JSON files on startup
- Watch for new/modified/deleted task files
- Execute recurring tasks via node-cron
- Execute one-shot tasks via 1-minute poller
- Deliver results to WebSocket clients scoped by instance
- Archive completed one-shot tasks
