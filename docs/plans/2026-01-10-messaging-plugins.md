# Messaging Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a plugin-agnostic messaging system that supports Telegram (and future platforms like Slack) for bidirectional chat and notifications with the LLM.

**Architecture:** Event bus pattern where messaging adapters normalize incoming messages, emit to a central bus, and the chat service consumes them. Responses flow back through the bus to the originating adapter. Each platform chat/group maps to its own session.

**Tech Stack:** TypeScript, Telegraf (Telegram), EventEmitter, OpenAI Whisper API (audio transcription)

---

## Task 1: Create Plugin Type Definitions

**Files:**
- Create: `apps/gateway/src/plugins/types.ts`

**Step 1: Write the type definitions**

```typescript
// apps/gateway/src/plugins/types.ts

import type { StreamChunk } from "../chat/types.js";

// === Normalized Message Types ===

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "image"; url?: string; localPath: string; mimeType: string }
  | { type: "audio"; url?: string; localPath: string; mimeType: string; transcription?: string }
  | { type: "file"; url?: string; localPath: string; filename: string; mimeType: string };

export interface MessageSender {
  id: string;
  name?: string;
  username?: string;
}

export interface NormalizedMessage {
  id: string;
  pluginId: string;
  chatId: string;
  sessionId: string;
  instanceId: string;
  sender: MessageSender;
  content: MessageContent[];
  timestamp: Date;
  replyTo?: string;
}

// === Outgoing Message Types ===

export type OutgoingContent =
  | { type: "text"; text: string }
  | { type: "image"; path: string }
  | { type: "file"; path: string; filename: string };

export interface OutgoingMessage {
  sessionId: string;
  chatId: string;
  pluginId: string;
  content: OutgoingContent[];
  isStreaming: boolean;
  isComplete: boolean;
}

// === Notification Types ===

export interface PluginNotification {
  instanceId: string;
  pluginId: string;
  chatId: string;
  title?: string;
  content: OutgoingContent[];
  priority: "normal" | "high";
}

// === Event Bus Types ===

export interface PluginEventMap {
  "incoming": NormalizedMessage;
  "outgoing": OutgoingMessage;
  "outgoing-chunk": OutgoingMessage;
  "notification": PluginNotification;
}

// === Plugin Interface ===

export interface MessagePlugin {
  id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(chatId: string, message: OutgoingMessage): Promise<void>;
  sendNotification?(chatId: string, notification: PluginNotification): Promise<void>;
}

// === Plugin Configuration ===

export interface PluginConfig {
  enabled: boolean;
  instanceId?: string;
  [key: string]: unknown;
}

export interface PluginsConfig {
  plugins: Record<string, PluginConfig>;
}

export interface TelegramPluginConfig extends PluginConfig {
  botToken: string;
  instanceId: string;
  notificationChatId?: string;
}

export interface WebSocketPluginConfig extends PluginConfig {
  // WebSocket uses default instance from gateway config
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/types.ts
git commit -m "feat(plugins): add messaging plugin type definitions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Event Bus

**Files:**
- Create: `apps/gateway/src/plugins/event-bus.ts`

**Step 1: Write the event bus implementation**

```typescript
// apps/gateway/src/plugins/event-bus.ts

import { EventEmitter } from "events";
import type { PluginEventMap } from "./types.js";

class TypedEventEmitter<T extends Record<string, unknown>> {
  private emitter = new EventEmitter();

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): boolean {
    return this.emitter.emit(event as string, data);
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    this.emitter.removeAllListeners(event as string);
    return this;
  }
}

export const eventBus = new TypedEventEmitter<PluginEventMap>();
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/event-bus.ts
git commit -m "feat(plugins): add typed event bus for plugin communication

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Plugin Registry

**Files:**
- Create: `apps/gateway/src/plugins/registry.ts`

**Step 1: Write the registry implementation**

```typescript
// apps/gateway/src/plugins/registry.ts

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { eventBus } from "./event-bus.js";
import type { MessagePlugin, PluginsConfig, PluginConfig } from "./types.js";

const ENV_VAR_PATTERN = /\$\{(\w+)\}/g;

function resolveEnvVars<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(ENV_VAR_PATTERN, (_, key) => {
      const envValue = process.env[key];
      if (envValue === undefined) {
        logger.warn({ key }, "Environment variable not found");
        return "";
      }
      return envValue;
    }) as T;
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars) as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveEnvVars(v)])
    ) as T;
  }
  return value;
}

class PluginRegistry {
  private plugins = new Map<string, MessagePlugin>();
  private configPath: string;

  constructor() {
    this.configPath = join(config.dataDir, "plugins.json");
  }

  async loadFromConfig(): Promise<void> {
    if (!existsSync(this.configPath)) {
      logger.info({ path: this.configPath }, "No plugins config found, using defaults");
      return;
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw) as PluginsConfig;
      const pluginsConfig = resolveEnvVars(parsed);

      for (const [id, settings] of Object.entries(pluginsConfig.plugins)) {
        if (!settings.enabled) {
          logger.debug({ pluginId: id }, "Plugin disabled, skipping");
          continue;
        }

        await this.loadPlugin(id, settings);
      }
    } catch (error) {
      logger.error({ error, path: this.configPath }, "Failed to load plugins config");
      throw error;
    }
  }

  private async loadPlugin(id: string, settings: PluginConfig): Promise<void> {
    try {
      const adapterModule = await import(`./adapters/${id}/index.js`);
      const plugin = adapterModule.create(settings, eventBus);
      this.plugins.set(id, plugin);
      logger.info({ pluginId: id }, "Plugin loaded");
    } catch (error) {
      logger.error({ error, pluginId: id }, "Failed to load plugin");
      throw error;
    }
  }

  async startAll(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      try {
        await plugin.start();
        logger.info({ pluginId: id }, "Plugin started");
      } catch (error) {
        logger.error({ error, pluginId: id }, "Failed to start plugin");
        throw error;
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      try {
        await plugin.stop();
        logger.info({ pluginId: id }, "Plugin stopped");
      } catch (error) {
        logger.error({ error, pluginId: id }, "Failed to stop plugin");
      }
    }
  }

  get(id: string): MessagePlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): MessagePlugin[] {
    return Array.from(this.plugins.values());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }
}

export const pluginRegistry = new PluginRegistry();
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/registry.ts
git commit -m "feat(plugins): add plugin registry with config loading

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Media Storage Utilities

**Files:**
- Create: `apps/gateway/src/plugins/media/storage.ts`
- Create: `apps/gateway/src/plugins/media/index.ts`

**Step 1: Write media storage**

```typescript
// apps/gateway/src/plugins/media/storage.ts

import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import { v4 as uuid } from "uuid";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export interface StoredMedia {
  localPath: string;
  mimeType: string;
  originalFilename?: string;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function getExtension(mimeType: string, filename?: string): string {
  if (filename) {
    const ext = filename.split(".").pop();
    if (ext) return ext;
  }
  return MIME_TO_EXT[mimeType] || "bin";
}

function getMediaDir(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return join(config.dataDir, "media", String(year), month);
}

export async function storeMedia(
  stream: Readable,
  metadata: { mimeType: string; filename?: string }
): Promise<StoredMedia> {
  const dir = getMediaDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const ext = getExtension(metadata.mimeType, metadata.filename);
  const filename = `${uuid()}.${ext}`;
  const localPath = join(dir, filename);

  try {
    const writeStream = createWriteStream(localPath);
    await pipeline(stream, writeStream);

    logger.debug({ localPath, mimeType: metadata.mimeType }, "Media stored");

    return {
      localPath,
      mimeType: metadata.mimeType,
      originalFilename: metadata.filename,
    };
  } catch (error) {
    logger.error({ error, localPath }, "Failed to store media");
    throw error;
  }
}

export async function storeMediaFromBuffer(
  buffer: Buffer,
  metadata: { mimeType: string; filename?: string }
): Promise<StoredMedia> {
  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);
  return storeMedia(stream, metadata);
}
```

**Step 2: Write index export**

```typescript
// apps/gateway/src/plugins/media/index.ts

export { storeMedia, storeMediaFromBuffer, type StoredMedia } from "./storage.js";
```

**Step 3: Commit**

```bash
git add apps/gateway/src/plugins/media/
git commit -m "feat(plugins): add media storage utilities

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Audio Transcription Service

**Files:**
- Create: `apps/gateway/src/plugins/media/transcription.ts`
- Modify: `apps/gateway/src/plugins/media/index.ts`

**Step 1: Write transcription service**

```typescript
// apps/gateway/src/plugins/media/transcription.ts

import { readFileSync } from "fs";
import { logger } from "../../lib/logger.js";

interface TranscriptionResult {
  text: string;
  language?: string;
}

export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn("OPENAI_API_KEY not set, skipping transcription");
    return { text: "[Audio message - transcription unavailable]" };
  }

  try {
    const audioBuffer = readFileSync(audioPath);
    const filename = audioPath.split("/").pop() || "audio.ogg";

    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), filename);
    formData.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} ${errorText}`);
    }

    const result = await response.json() as { text: string; language?: string };

    logger.debug({ audioPath, textLength: result.text.length }, "Audio transcribed");

    return {
      text: result.text,
      language: result.language,
    };
  } catch (error) {
    logger.error({ error, audioPath }, "Failed to transcribe audio");
    return { text: "[Audio message - transcription failed]" };
  }
}
```

**Step 2: Update index export**

```typescript
// apps/gateway/src/plugins/media/index.ts

export { storeMedia, storeMediaFromBuffer, type StoredMedia } from "./storage.js";
export { transcribeAudio } from "./transcription.js";
```

**Step 3: Commit**

```bash
git add apps/gateway/src/plugins/media/
git commit -m "feat(plugins): add audio transcription via Whisper API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Chat Handler for Plugin System

**Files:**
- Create: `apps/gateway/src/plugins/chat-handler.ts`

**Step 1: Write the chat handler**

```typescript
// apps/gateway/src/plugins/chat-handler.ts

import { eventBus } from "./event-bus.js";
import { streamChat } from "../chat/service.js";
import { logger } from "../lib/logger.js";
import type { NormalizedMessage, OutgoingMessage, MessageContent } from "./types.js";
import type { ChatRequest, ChatMessage } from "../chat/types.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert NormalizedMessage content to ChatMessage format for the LLM.
 * Handles text, images (for vision), and audio (transcription).
 */
function buildChatMessageContent(content: MessageContent[]): string {
  const parts: string[] = [];

  for (const item of content) {
    switch (item.type) {
      case "text":
        parts.push(item.text);
        break;
      case "image":
        // For now, add a note about the image. Vision support will be added later.
        parts.push(`[Image attached: ${item.localPath}]`);
        break;
      case "audio":
        if (item.transcription) {
          parts.push(`[Voice message]: ${item.transcription}`);
        } else {
          parts.push(`[Audio attached: ${item.localPath}]`);
        }
        break;
      case "file":
        parts.push(`[File attached: ${item.filename}]`);
        break;
    }
  }

  return parts.join("\n");
}

async function handleIncoming(message: NormalizedMessage): Promise<void> {
  logger.debug(
    { pluginId: message.pluginId, chatId: message.chatId, sessionId: message.sessionId },
    "Processing incoming message"
  );

  const chatMessage: ChatMessage = {
    id: message.id,
    role: "user",
    content: buildChatMessageContent(message.content),
  };

  const chatRequest: ChatRequest = {
    sessionId: message.sessionId,
    instanceId: message.instanceId,
    message: chatMessage,
  };

  const collectedText: string[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      for await (const chunk of streamChat(chatRequest)) {
        // Collect text for final message
        if (chunk.type === "text-delta") {
          collectedText.push(chunk.delta);
        }

        // Emit streaming chunks
        eventBus.emit("outgoing-chunk", {
          sessionId: message.sessionId,
          chatId: message.chatId,
          pluginId: message.pluginId,
          content: [{ type: "text", text: chunk.type === "text-delta" ? chunk.delta : "" }],
          isStreaming: true,
          isComplete: false,
        });

        // On finish, emit complete message
        if (chunk.type === "finish") {
          eventBus.emit("outgoing", {
            sessionId: message.sessionId,
            chatId: message.chatId,
            pluginId: message.pluginId,
            content: [{ type: "text", text: collectedText.join("") }],
            isStreaming: false,
            isComplete: true,
          });
        }
      }
      return; // Success
    } catch (error) {
      logger.error(
        { error, attempt, maxRetries: MAX_RETRIES, sessionId: message.sessionId },
        "Chat processing failed"
      );

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      // All retries exhausted - notify user
      eventBus.emit("outgoing", {
        sessionId: message.sessionId,
        chatId: message.chatId,
        pluginId: message.pluginId,
        content: [{
          type: "text",
          text: "Sorry, I'm having trouble processing your message. Please try again in a moment.",
        }],
        isStreaming: false,
        isComplete: true,
      });
    }
  }
}

export function startChatHandler(): void {
  eventBus.on("incoming", handleIncoming);
  logger.info("Chat handler started");
}

export function stopChatHandler(): void {
  eventBus.off("incoming", handleIncoming);
  logger.info("Chat handler stopped");
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/chat-handler.ts
git commit -m "feat(plugins): add chat handler to bridge event bus with LLM

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Plugin System Index

**Files:**
- Create: `apps/gateway/src/plugins/index.ts`

**Step 1: Write the main export**

```typescript
// apps/gateway/src/plugins/index.ts

export * from "./types.js";
export { eventBus } from "./event-bus.js";
export { pluginRegistry } from "./registry.js";
export { startChatHandler, stopChatHandler } from "./chat-handler.js";
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/index.ts
git commit -m "feat(plugins): add plugin system main export

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Create WebSocket Adapter

**Files:**
- Create: `apps/gateway/src/plugins/adapters/websocket/index.ts`
- Create: `apps/gateway/src/plugins/adapters/websocket/types.ts`
- Create: `apps/gateway/src/plugins/adapters/websocket/handlers.ts`

**Step 1: Write WebSocket types**

```typescript
// apps/gateway/src/plugins/adapters/websocket/types.ts

import type { WebSocketPluginConfig } from "../../types.js";

export interface WebSocketAdapterConfig extends WebSocketPluginConfig {
  port?: number;
}
```

**Step 2: Write WebSocket handlers**

```typescript
// apps/gateway/src/plugins/adapters/websocket/handlers.ts

import type { Socket } from "socket.io";
import { v4 as uuid } from "uuid";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import type { NormalizedMessage, OutgoingMessage } from "../../types.js";
import type { ChatMessage } from "../../../chat/types.js";

const PLUGIN_ID = "websocket";

interface ChatEventData {
  instanceId?: string;
  sessionId?: string;
  message: ChatMessage;
}

export function setupSocketHandlers(
  socket: Socket,
  defaultInstance: string
): void {
  let currentInstance = (socket.handshake.query.instance as string) || defaultInstance;
  const clientId = socket.id;

  // Handle incoming chat messages
  socket.on("chat", (data: ChatEventData) => {
    const instanceId = data.instanceId || currentInstance;
    const sessionId = data.sessionId || `web:${clientId}:${uuid()}`;

    const normalized: NormalizedMessage = {
      id: uuid(),
      pluginId: PLUGIN_ID,
      chatId: clientId,
      sessionId,
      instanceId,
      sender: {
        id: clientId,
      },
      content: [{ type: "text", text: data.message.content }],
      timestamp: new Date(),
    };

    logger.debug({ sessionId, instanceId }, "WebSocket chat received");
    eventBus.emit("incoming", normalized);
  });

  // Handle instance switching
  socket.on("switch-instance", (newInstance: string) => {
    currentInstance = newInstance;
    socket.emit("instance-switched", { instance: newInstance });
  });

  // Ping/pong for health checks
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: Date.now() });
  });
}

export function createOutgoingHandler(
  getSocket: (chatId: string) => Socket | undefined
): (message: OutgoingMessage) => void {
  return (message: OutgoingMessage) => {
    if (message.pluginId !== PLUGIN_ID) return;

    const socket = getSocket(message.chatId);
    if (!socket) {
      logger.debug({ chatId: message.chatId }, "Socket not found for outgoing message");
      return;
    }

    // For WebSocket, emit chunks for streaming
    if (message.isStreaming && !message.isComplete) {
      const textContent = message.content.find((c) => c.type === "text");
      if (textContent && textContent.type === "text") {
        socket.emit("chat-chunk", {
          type: "text-delta",
          delta: textContent.text,
        });
      }
    }

    // Emit completion
    if (message.isComplete) {
      socket.emit("chat-chunk", { type: "finish", finishReason: "stop" });
      socket.emit("chat-complete", { sessionId: message.sessionId });
    }
  };
}

export function createChunkHandler(
  getSocket: (chatId: string) => Socket | undefined
): (message: OutgoingMessage) => void {
  return (message: OutgoingMessage) => {
    if (message.pluginId !== PLUGIN_ID) return;

    const socket = getSocket(message.chatId);
    if (!socket) return;

    const textContent = message.content.find((c) => c.type === "text");
    if (textContent && textContent.type === "text" && textContent.text) {
      socket.emit("chat-chunk", {
        type: "text-delta",
        delta: textContent.text,
      });
    }
  };
}
```

**Step 3: Write WebSocket adapter index**

```typescript
// apps/gateway/src/plugins/adapters/websocket/index.ts

import { createServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { config } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import { eventBus } from "../../event-bus.js";
import type { MessagePlugin, WebSocketPluginConfig } from "../../types.js";
import { setupSocketHandlers, createOutgoingHandler, createChunkHandler } from "./handlers.js";

export function create(
  pluginConfig: WebSocketPluginConfig,
  _eventBus: typeof eventBus
): MessagePlugin {
  let httpServer: ReturnType<typeof createServer> | null = null;
  let io: SocketServer | null = null;
  const sockets = new Map<string, Socket>();

  const getSocket = (chatId: string): Socket | undefined => sockets.get(chatId);

  return {
    id: "websocket",

    async start(): Promise<void> {
      return new Promise((resolve, reject) => {
        httpServer = createServer();

        io = new SocketServer(httpServer, {
          cors: {
            origin: "*",
            methods: ["GET", "POST"],
          },
        });

        io.on("connection", (socket) => {
          sockets.set(socket.id, socket);
          logger.debug({ socketId: socket.id }, "WebSocket client connected");

          setupSocketHandlers(socket, config.defaultInstance);

          socket.on("disconnect", () => {
            sockets.delete(socket.id);
            logger.debug({ socketId: socket.id }, "WebSocket client disconnected");
          });
        });

        // Subscribe to outgoing events
        eventBus.on("outgoing", createOutgoingHandler(getSocket));
        eventBus.on("outgoing-chunk", createChunkHandler(getSocket));

        httpServer.on("error", reject);

        httpServer.listen(config.wsPort, () => {
          logger.info({ port: config.wsPort }, "WebSocket plugin started");
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve) => {
        eventBus.off("outgoing", createOutgoingHandler(getSocket));
        eventBus.off("outgoing-chunk", createChunkHandler(getSocket));

        if (io) {
          io.close(() => {
            logger.info("WebSocket plugin stopped");
            io = null;
            httpServer = null;
            sockets.clear();
            resolve();
          });
        } else {
          resolve();
        }
      });
    },

    async send(chatId: string, message): Promise<void> {
      const socket = sockets.get(chatId);
      if (!socket) {
        logger.warn({ chatId }, "Cannot send: socket not found");
        return;
      }

      const textContent = message.content.find((c) => c.type === "text");
      if (textContent && textContent.type === "text") {
        socket.emit("chat-chunk", {
          type: "text-delta",
          delta: textContent.text,
        });
      }

      if (message.isComplete) {
        socket.emit("chat-complete", { sessionId: message.sessionId });
      }
    },
  };
}
```

**Step 4: Commit**

```bash
git add apps/gateway/src/plugins/adapters/websocket/
git commit -m "feat(plugins): add WebSocket adapter using plugin system

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Create Telegram Adapter - Types and Client

**Files:**
- Create: `apps/gateway/src/plugins/adapters/telegram/types.ts`
- Create: `apps/gateway/src/plugins/adapters/telegram/client.ts`

**Step 1: Add telegraf dependency**

```bash
cd /Users/schester/work/pinky/apps/gateway && yarn add telegraf
```

**Step 2: Write Telegram types**

```typescript
// apps/gateway/src/plugins/adapters/telegram/types.ts

import type { TelegramPluginConfig } from "../../types.js";

export interface TelegramAdapterConfig extends TelegramPluginConfig {
  botToken: string;
  instanceId: string;
  notificationChatId?: string;
}

export interface TelegramContext {
  chatId: string;
  messageId: number;
  userId: string;
  username?: string;
  firstName?: string;
}
```

**Step 3: Write Telegram client**

```typescript
// apps/gateway/src/plugins/adapters/telegram/client.ts

import { Telegraf } from "telegraf";
import { logger } from "../../../lib/logger.js";
import type { TelegramAdapterConfig } from "./types.js";

export function createTelegramBot(config: TelegramAdapterConfig): Telegraf {
  const bot = new Telegraf(config.botToken);

  bot.catch((err, ctx) => {
    logger.error({ err, updateType: ctx.updateType }, "Telegram bot error");
  });

  return bot;
}

export async function startBot(bot: Telegraf): Promise<void> {
  await bot.launch();
  logger.info("Telegram bot launched");
}

export async function stopBot(bot: Telegraf): Promise<void> {
  bot.stop("SIGTERM");
  logger.info("Telegram bot stopped");
}
```

**Step 4: Commit**

```bash
git add apps/gateway/src/plugins/adapters/telegram/types.ts apps/gateway/src/plugins/adapters/telegram/client.ts
git commit -m "feat(telegram): add types and client setup

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Create Telegram Adapter - Media Handling

**Files:**
- Create: `apps/gateway/src/plugins/adapters/telegram/media.ts`

**Step 1: Write Telegram media handler**

```typescript
// apps/gateway/src/plugins/adapters/telegram/media.ts

import type { Context } from "telegraf";
import type { Message, PhotoSize, Voice, Audio, Document } from "telegraf/types";
import { storeMediaFromBuffer } from "../../media/index.js";
import { transcribeAudio } from "../../media/transcription.js";
import { logger } from "../../../lib/logger.js";
import type { MessageContent } from "../../types.js";

async function downloadTelegramFile(
  ctx: Context,
  fileId: string
): Promise<Buffer> {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function handlePhoto(
  ctx: Context,
  photos: PhotoSize[]
): Promise<MessageContent> {
  // Get largest photo
  const photo = photos.reduce((a, b) =>
    (a.file_size || 0) > (b.file_size || 0) ? a : b
  );

  try {
    const buffer = await downloadTelegramFile(ctx, photo.file_id);
    const stored = await storeMediaFromBuffer(buffer, { mimeType: "image/jpeg" });

    return {
      type: "image",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
    };
  } catch (error) {
    logger.error({ error, fileId: photo.file_id }, "Failed to handle photo");
    throw error;
  }
}

export async function handleVoice(
  ctx: Context,
  voice: Voice
): Promise<MessageContent> {
  try {
    const buffer = await downloadTelegramFile(ctx, voice.file_id);
    const stored = await storeMediaFromBuffer(buffer, { mimeType: voice.mime_type || "audio/ogg" });
    const transcription = await transcribeAudio(stored.localPath);

    return {
      type: "audio",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
      transcription: transcription.text,
    };
  } catch (error) {
    logger.error({ error, fileId: voice.file_id }, "Failed to handle voice");
    throw error;
  }
}

export async function handleAudio(
  ctx: Context,
  audio: Audio
): Promise<MessageContent> {
  try {
    const buffer = await downloadTelegramFile(ctx, audio.file_id);
    const stored = await storeMediaFromBuffer(buffer, {
      mimeType: audio.mime_type || "audio/mpeg",
      filename: audio.file_name,
    });
    const transcription = await transcribeAudio(stored.localPath);

    return {
      type: "audio",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
      transcription: transcription.text,
    };
  } catch (error) {
    logger.error({ error, fileId: audio.file_id }, "Failed to handle audio");
    throw error;
  }
}

export async function handleDocument(
  ctx: Context,
  document: Document
): Promise<MessageContent> {
  try {
    const buffer = await downloadTelegramFile(ctx, document.file_id);
    const stored = await storeMediaFromBuffer(buffer, {
      mimeType: document.mime_type || "application/octet-stream",
      filename: document.file_name,
    });

    return {
      type: "file",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
      filename: document.file_name || "file",
    };
  } catch (error) {
    logger.error({ error, fileId: document.file_id }, "Failed to handle document");
    throw error;
  }
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/adapters/telegram/media.ts
git commit -m "feat(telegram): add media download and processing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Create Telegram Adapter - Message Handlers

**Files:**
- Create: `apps/gateway/src/plugins/adapters/telegram/handlers.ts`

**Step 1: Write message handlers**

```typescript
// apps/gateway/src/plugins/adapters/telegram/handlers.ts

import type { Context, Telegraf } from "telegraf";
import type { Message, Update } from "telegraf/types";
import { v4 as uuid } from "uuid";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import type { NormalizedMessage, MessageContent } from "../../types.js";
import type { TelegramAdapterConfig } from "./types.js";
import { handlePhoto, handleVoice, handleAudio, handleDocument } from "./media.js";

const PLUGIN_ID = "telegram";

function buildSessionId(chatId: number): string {
  return `telegram:${chatId}`;
}

function extractSender(ctx: Context): { id: string; name?: string; username?: string } {
  const from = ctx.from;
  return {
    id: String(from?.id || "unknown"),
    name: from?.first_name,
    username: from?.username,
  };
}

async function processMessage(
  ctx: Context,
  config: TelegramAdapterConfig
): Promise<void> {
  const message = ctx.message as Message.TextMessage | Message.PhotoMessage | Message.VoiceMessage | Message.AudioMessage | Message.DocumentMessage;

  if (!message) return;

  const chatId = String(message.chat.id);
  const content: MessageContent[] = [];

  try {
    // Handle text
    if ("text" in message && message.text) {
      content.push({ type: "text", text: message.text });
    }

    // Handle caption (for media messages)
    if ("caption" in message && message.caption) {
      content.push({ type: "text", text: message.caption });
    }

    // Handle photo
    if ("photo" in message && message.photo) {
      const photoContent = await handlePhoto(ctx, message.photo);
      content.push(photoContent);
    }

    // Handle voice
    if ("voice" in message && message.voice) {
      const voiceContent = await handleVoice(ctx, message.voice);
      content.push(voiceContent);
    }

    // Handle audio
    if ("audio" in message && message.audio) {
      const audioContent = await handleAudio(ctx, message.audio);
      content.push(audioContent);
    }

    // Handle document
    if ("document" in message && message.document) {
      const docContent = await handleDocument(ctx, message.document);
      content.push(docContent);
    }

    if (content.length === 0) {
      logger.debug({ chatId, messageId: message.message_id }, "No processable content");
      return;
    }

    const normalized: NormalizedMessage = {
      id: uuid(),
      pluginId: PLUGIN_ID,
      chatId,
      sessionId: buildSessionId(message.chat.id),
      instanceId: config.instanceId,
      sender: extractSender(ctx),
      content,
      timestamp: new Date(message.date * 1000),
      replyTo: "reply_to_message" in message ? String(message.reply_to_message?.message_id) : undefined,
    };

    logger.debug(
      { chatId, sessionId: normalized.sessionId, contentTypes: content.map(c => c.type) },
      "Telegram message normalized"
    );

    eventBus.emit("incoming", normalized);
  } catch (error) {
    logger.error({ error, chatId }, "Failed to process Telegram message");
    await ctx.reply("Sorry, I couldn't process that message. Please try again.");
  }
}

export function setupMessageHandlers(
  bot: Telegraf,
  config: TelegramAdapterConfig
): void {
  // Handle text messages
  bot.on("text", (ctx) => processMessage(ctx, config));

  // Handle photos
  bot.on("photo", (ctx) => processMessage(ctx, config));

  // Handle voice messages
  bot.on("voice", (ctx) => processMessage(ctx, config));

  // Handle audio files
  bot.on("audio", (ctx) => processMessage(ctx, config));

  // Handle documents
  bot.on("document", (ctx) => processMessage(ctx, config));

  logger.info("Telegram message handlers registered");
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/adapters/telegram/handlers.ts
git commit -m "feat(telegram): add message handlers for text, media, and files

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Create Telegram Adapter - Formatting

**Files:**
- Create: `apps/gateway/src/plugins/adapters/telegram/formatting.ts`

**Step 1: Write formatting utilities**

```typescript
// apps/gateway/src/plugins/adapters/telegram/formatting.ts

/**
 * Convert standard markdown to Telegram MarkdownV2 format.
 * Telegram requires escaping special characters outside code blocks.
 */

const SPECIAL_CHARS = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

function escapeMarkdownV2(text: string): string {
  let result = '';
  let inCodeBlock = false;
  let inInlineCode = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];
    const nextNextChar = text[i + 2];

    // Check for code block start/end
    if (char === '`' && nextChar === '`' && nextNextChar === '`') {
      inCodeBlock = !inCodeBlock;
      result += '```';
      i += 3;
      continue;
    }

    // Check for inline code start/end
    if (char === '`' && !inCodeBlock) {
      inInlineCode = !inInlineCode;
      result += '`';
      i++;
      continue;
    }

    // Don't escape inside code blocks or inline code
    if (inCodeBlock || inInlineCode) {
      result += char;
      i++;
      continue;
    }

    // Escape special characters
    if (SPECIAL_CHARS.includes(char)) {
      result += '\\' + char;
    } else {
      result += char;
    }
    i++;
  }

  return result;
}

/**
 * Truncate text to Telegram's message limit (4096 chars).
 * Tries to break at sentence boundaries.
 */
function truncateText(text: string, maxLength: number = 4096): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength - 20);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');

  const breakPoint = Math.max(lastPeriod, lastNewline);

  if (breakPoint > maxLength / 2) {
    return text.slice(0, breakPoint + 1) + '\n\n[Message truncated]';
  }

  return truncated + '...\n\n[Message truncated]';
}

export function formatForTelegram(text: string): string {
  const escaped = escapeMarkdownV2(text);
  return truncateText(escaped);
}

/**
 * Split long messages into chunks for Telegram.
 */
export function splitMessage(text: string, maxLength: number = 4096): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf('\n', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf('. ', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/adapters/telegram/formatting.ts
git commit -m "feat(telegram): add markdown formatting and message splitting

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Create Telegram Adapter - Main Index

**Files:**
- Create: `apps/gateway/src/plugins/adapters/telegram/index.ts`

**Step 1: Write the main Telegram adapter**

```typescript
// apps/gateway/src/plugins/adapters/telegram/index.ts

import { Telegraf } from "telegraf";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import type { MessagePlugin, OutgoingMessage, PluginNotification, TelegramPluginConfig } from "../../types.js";
import type { TelegramAdapterConfig } from "./types.js";
import { createTelegramBot, startBot, stopBot } from "./client.js";
import { setupMessageHandlers } from "./handlers.js";
import { formatForTelegram, splitMessage } from "./formatting.js";

const PLUGIN_ID = "telegram";

export function create(
  pluginConfig: TelegramPluginConfig,
  _eventBus: typeof eventBus
): MessagePlugin {
  const config = pluginConfig as TelegramAdapterConfig;
  let bot: Telegraf | null = null;

  const handleOutgoing = async (message: OutgoingMessage): Promise<void> => {
    if (message.pluginId !== PLUGIN_ID) return;
    if (!message.isComplete) return; // Only send complete messages
    if (!bot) return;

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") return;

    try {
      const formatted = formatForTelegram(textContent.text);
      const chunks = splitMessage(formatted);

      for (const chunk of chunks) {
        await bot.telegram.sendMessage(message.chatId, chunk, {
          parse_mode: "MarkdownV2",
        });
      }
    } catch (error) {
      logger.error({ error, chatId: message.chatId }, "Failed to send Telegram message");

      // Fallback: try sending without formatting
      try {
        const textContent = message.content.find((c) => c.type === "text");
        if (textContent && textContent.type === "text") {
          await bot.telegram.sendMessage(message.chatId, textContent.text);
        }
      } catch (fallbackError) {
        logger.error({ error: fallbackError, chatId: message.chatId }, "Fallback send also failed");
      }
    }
  };

  const handleNotification = async (notification: PluginNotification): Promise<void> => {
    if (notification.pluginId !== PLUGIN_ID) return;
    if (!bot) return;

    const textContent = notification.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") return;

    try {
      const chatId = notification.chatId || config.notificationChatId;
      if (!chatId) {
        logger.warn("No chat ID for notification");
        return;
      }

      let text = textContent.text;
      if (notification.title) {
        text = `*${formatForTelegram(notification.title)}*\n\n${formatForTelegram(text)}`;
      }

      await bot.telegram.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      logger.error({ error }, "Failed to send Telegram notification");
    }
  };

  return {
    id: PLUGIN_ID,

    async start(): Promise<void> {
      bot = createTelegramBot(config);
      setupMessageHandlers(bot, config);

      eventBus.on("outgoing", handleOutgoing);
      eventBus.on("notification", handleNotification);

      await startBot(bot);
      logger.info({ instanceId: config.instanceId }, "Telegram plugin started");
    },

    async stop(): Promise<void> {
      eventBus.off("outgoing", handleOutgoing);
      eventBus.off("notification", handleNotification);

      if (bot) {
        await stopBot(bot);
        bot = null;
      }
      logger.info("Telegram plugin stopped");
    },

    async send(chatId: string, message: OutgoingMessage): Promise<void> {
      if (!bot) {
        logger.warn("Bot not initialized");
        return;
      }

      const textContent = message.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") return;

      const formatted = formatForTelegram(textContent.text);
      await bot.telegram.sendMessage(chatId, formatted, {
        parse_mode: "MarkdownV2",
      });
    },

    async sendNotification(chatId: string, notification: PluginNotification): Promise<void> {
      if (!bot) return;

      const textContent = notification.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") return;

      let text = textContent.text;
      if (notification.title) {
        text = `*${formatForTelegram(notification.title)}*\n\n${formatForTelegram(text)}`;
      }

      await bot.telegram.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
      });
    },
  };
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/plugins/adapters/telegram/index.ts
git commit -m "feat(telegram): add main adapter integrating all components

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Update Gateway to Use Plugin System

**Files:**
- Modify: `apps/gateway/src/index.ts`

**Step 1: Update gateway startup**

Replace the contents of `apps/gateway/src/index.ts` with:

```typescript
// apps/gateway/src/index.ts

import { logger } from "./lib/logger.js";
import {
  startScheduler,
  stopScheduler,
  getSchedulerStats,
} from "./tasks/scheduler.js";
import { startTRPCServer, stopTRPCServer } from "./trpc/server.js";
import { pluginRegistry, startChatHandler, stopChatHandler } from "./plugins/index.js";

async function startGateway() {
  logger.info("Starting Pinky Gateway");

  // Start chat handler (bridges event bus to LLM)
  startChatHandler();

  // Load and start plugins
  await pluginRegistry.loadFromConfig();
  await pluginRegistry.startAll();

  await startTRPCServer();

  await startScheduler({
    defaultInstanceId: "default",
  });

  setInterval(() => {
    const schedulerStats = getSchedulerStats();
    logger.debug(
      { scheduler: schedulerStats },
      "Gateway stats",
    );
  }, 60000);

  logger.info("Pinky Gateway started successfully");
}

async function shutdown() {
  logger.info("Shutting down gateway");

  await stopScheduler();
  await pluginRegistry.stopAll();
  stopChatHandler();
  await stopTRPCServer();

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

**Step 2: Commit**

```bash
git add apps/gateway/src/index.ts
git commit -m "feat(gateway): integrate plugin system into startup

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Create Default Plugins Configuration

**Files:**
- Create: `apps/gateway/plugins.example.json` (example config)

**Step 1: Create example config**

```json
{
  "plugins": {
    "websocket": {
      "enabled": true
    },
    "telegram": {
      "enabled": false,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "instanceId": "default",
      "notificationChatId": ""
    }
  }
}
```

**Step 2: Update README or add setup instructions**

Add a note in the gateway package about copying and configuring `plugins.example.json` to `~/.pinky/plugins.json`.

**Step 3: Commit**

```bash
git add apps/gateway/plugins.example.json
git commit -m "docs(gateway): add example plugins configuration

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 16: Remove Old WebSocket File

**Files:**
- Delete: `apps/gateway/src/websocket.ts`

**Step 1: Remove the old websocket file**

The functionality has been moved to `apps/gateway/src/plugins/adapters/websocket/`. Delete the old file.

```bash
rm apps/gateway/src/websocket.ts
```

**Step 2: Commit**

```bash
git add -A
git commit -m "refactor(gateway): remove old websocket.ts in favor of plugin adapter

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 17: Update Dispatcher for Plugin Notifications

**Files:**
- Modify: `apps/gateway/src/tasks/dispatcher.ts`

**Step 1: Update dispatcher to use event bus for notifications**

Add to the dispatcher file, updating the dispatch function to emit to the event bus:

```typescript
// Add import at top
import { eventBus } from "../plugins/event-bus.js";
import type { PluginNotification } from "../plugins/types.js";

// Update or add a new function for plugin-based dispatch
export async function dispatchToPlugins(
  result: ExecutionResult,
  channels: string[] = ["websocket"]
): Promise<void> {
  for (const channelName of channels) {
    const notification: PluginNotification = {
      instanceId: result.instance,
      pluginId: channelName,
      chatId: "", // Will use default from plugin config
      title: `Task: ${result.taskId}`,
      content: [{ type: "text", text: result.result || result.error || "Task completed" }],
      priority: "normal",
    };

    eventBus.emit("notification", notification);
    logger.debug({ channelName, taskId: result.taskId }, "Notification dispatched");
  }
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/tasks/dispatcher.ts
git commit -m "feat(dispatcher): add event bus notification support

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 18: Test the Plugin System

**Step 1: Start the gateway and verify WebSocket still works**

```bash
cd /Users/schester/work/pinky/apps/gateway && yarn dev
```

Verify:
- Gateway starts without errors
- WebSocket plugin initializes
- Existing web client can connect and chat

**Step 2: Create a test plugins.json with Telegram enabled**

Create `~/.pinky/plugins.json`:
```json
{
  "plugins": {
    "websocket": {
      "enabled": true
    },
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "instanceId": "default"
    }
  }
}
```

Set `TELEGRAM_BOT_TOKEN` in environment.

**Step 3: Test Telegram integration**

- Send a text message to the bot
- Send a photo
- Send a voice message
- Verify responses come back

**Step 4: Document any issues and fixes**

---

## Summary

This plan creates a plugin-agnostic messaging system with:

1. **Core Infrastructure** (Tasks 1-7): Types, event bus, registry, media handling, chat handler
2. **WebSocket Adapter** (Task 8): Refactored existing WebSocket as a plugin
3. **Telegram Adapter** (Tasks 9-13): Full Telegram support with text, photos, audio, files
4. **Integration** (Tasks 14-17): Gateway updates, config, dispatcher changes
5. **Testing** (Task 18): Verification steps

Future platforms (Slack, Discord) can be added by creating new adapters in `plugins/adapters/` following the same pattern.
