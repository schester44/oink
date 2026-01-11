/**
 * Agent Service - Uses @mariozechner/pi-coding-agent SDK
 *
 * Manages agent sessions per instance, using pi-coding-agent for:
 * - Session management (stored in ~/.pinky/instances/{instanceId}/sessions)
 * - Built-in tools (read, bash, edit, write)
 * - Streaming responses
 */

import { getModel, type ImageContent } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  discoverAuthStorage,
  discoverModels,
  discoverSkills,
  SessionManager,
  SettingsManager,
  createCodingTools,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

import { getSessionsDir, getWorkspaceDir, config } from "../config.js";
import { buildSystemPrompt } from "../chat/prompts.js";
import { logger } from "../logger.js";
import { readSettings } from "../lib/settings.js";
import { recordLLMRequest } from "../lib/telemetry/index.js";
import { initializeBrain } from "../brain/brain.js";
import { createCronToolDefinition } from "./tools/cron-pi.js";

// Re-export event types for consumers
export type { AgentSessionEvent };

/**
 * StreamChunk - AI SDK UIMessageChunk compatible format
 * These chunks are sent to the frontend and must match what useChat expects
 */
export type StreamChunk =
  | { type: "start"; messageId?: string }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "start-step" }
  | { type: "finish-step" }
  | { type: "tool-input-start"; toolCallId: string; toolName: string }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | { type: "tool-output-available"; toolCallId: string; output: unknown }
  | { type: "finish"; finishReason: string }
  | { type: "error"; errorText: string };

export interface ChatRequest {
  sessionId?: string;
  instanceId: string;
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    parts?: Array<{
      type: string;
      text?: string;
      image?: string;
      mimeType?: string;
      [key: string]: unknown;
    }>;
  };
  sourceChannel?: string;
  chatId?: string;
}

interface SessionInfo {
  session: AgentSession;
  instanceId: string;
  lastUsed: number;
}

// Cache of active sessions
const activeSessions = new Map<string, SessionInfo>();

// Session cleanup interval (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Ensure sessions directory exists
 */
function ensureSessionsDir(instanceId: string): string {
  const sessionsDir = getSessionsDir(instanceId);

  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  return sessionsDir;
}

/**
 * Get or create an agent session for a given session ID and instance
 */
async function getOrCreateSession(
  sessionId: string | undefined,
  instanceId: string,
  sourceChannel?: string,
  chatId?: string,
): Promise<AgentSession> {
  const cacheKey = sessionId || `new:${instanceId}:${Date.now()}`;

  // Check cache
  const cached = activeSessions.get(cacheKey);

  if (cached && cached.instanceId === instanceId) {
    cached.lastUsed = Date.now();

    return cached.session;
  }

  // Initialize brain files
  await initializeBrain({
    brainTemplatesDir: config.templatesDir,
    systemSkillsDir: config.systemSkillsDir,
    instanceId,
  });

  const workspaceDir = getWorkspaceDir(instanceId);
  const sessionsDir = ensureSessionsDir(instanceId);

  // Set up auth storage using ~/.pinky directory
  const authStorage = discoverAuthStorage(config.dataDir);

  // Runtime API key from environment if set
  if (process.env.ANTHROPIC_API_KEY) {
    authStorage.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY);
  }

  // Model registry (built-in models + custom from ~/.pinky/models.json)
  const modelRegistry = discoverModels(authStorage, config.dataDir);

  // Get model
  const model = getModel("anthropic", "claude-sonnet-4-5");

  if (!model) {
    throw new Error("Model not found: claude-sonnet-4-5");
  }

  // Build system prompt
  const settings = readSettings();
  const systemPrompt = buildSystemPrompt({
    instanceId,
    userTimezone: settings.timezone,
  });

  // Load settings from ~/.pinky/agent/ directory
  // Load settings from ~/.pinky/ directory
  const settingsManager = SettingsManager.create(workspaceDir, config.dataDir);

  // Create cron tool
  const cronTool = createCronToolDefinition({
    instanceId,
    sourceChannel,
    chatId,
  });

  // Create session manager
  let sessionManager: ReturnType<
    typeof SessionManager.create | typeof SessionManager.open
  >;

  if (sessionId) {
    // Try to open existing session
    const sessionPath = join(sessionsDir, `${sessionId}.jsonl`);

    if (existsSync(sessionPath)) {
      sessionManager = SessionManager.open(sessionPath);
    } else {
      // Create new session (custom directory)
      sessionManager = SessionManager.create(workspaceDir, sessionsDir);
    }
  } else {
    // Create new session
    sessionManager = SessionManager.create(workspaceDir, sessionsDir);
  }

  // Discover skills from brain/skills and system-skills directories
  const brainSkillsDir = join(workspaceDir, "skills");
  const { skills: brainSkills } = discoverSkills(
    brainSkillsDir,
    config.dataDir,
  );
  const { skills: systemSkills } = discoverSkills(
    config.systemSkillsDir,
    config.dataDir,
  );
  const skills = [...systemSkills, ...brainSkills];

  logger.debug(
    { skillCount: skills.length, skillNames: skills.map((s) => s.name) },
    "Discovered skills",
  );

  // Create agent session with full control
  const { session } = await createAgentSession({
    cwd: workspaceDir,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    systemPrompt,
    tools: createCodingTools(workspaceDir),
    customTools: [cronTool as unknown as ToolDefinition],
    extensions: [],
    skills,
    contextFiles: [],
    promptTemplates: [],
    sessionManager,
    settingsManager,
  });

  // Cache the session
  activeSessions.set(session.sessionId, {
    session,
    instanceId,
    lastUsed: Date.now(),
  });

  return session;
}

/**
 * Stream a chat response using pi-coding-agent
 * Emits AI SDK UIMessageChunk compatible chunks for the frontend
 */
export async function* streamChat(
  request: ChatRequest,
): AsyncGenerator<StreamChunk> {
  const { sessionId, instanceId, message, sourceChannel, chatId } = request;

  try {
    const session = await getOrCreateSession(
      sessionId,
      instanceId,
      sourceChannel,
      chatId,
    );

    // Build prompt content
    const promptText = message.content;

    // Handle multipart messages (images)
    const images: ImageContent[] = [];

    if (message.parts) {
      for (const part of message.parts) {
        if (part.type === "image" && part.image) {
          images.push({
            type: "image",
            data: part.image as string,
            mimeType: (part.mimeType as string) || "image/jpeg",
          });
        }
      }
    }

    // Token tracking
    let inputTokens = 0;
    let outputTokens = 0;

    // Generate a message ID for this response
    const messageId = generateMessageId();

    // Set up event listener for streaming
    const chunks: StreamChunk[] = [];
    let resolveChunk: (() => void) | null = null;
    let done = false;
    let textStarted = false;
    let streamStarted = false;

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      const emitChunk = (chunk: StreamChunk) => {
        chunks.push(chunk);
        if (resolveChunk) {
          resolveChunk();
          resolveChunk = null;
        }
      };

      switch (event.type) {
        case "agent_start":
          // Emit start chunk at the very beginning
          if (!streamStarted) {
            streamStarted = true;
            emitChunk({ type: "start", messageId });
          }
          break;

        case "message_start":
          // Don't emit text-start yet, wait for first text delta
          break;

        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            // Emit text-start on first delta
            if (!textStarted) {
              textStarted = true;
              emitChunk({ type: "text-start", id: messageId });
            }
            emitChunk({
              type: "text-delta",
              id: messageId,
              delta: event.assistantMessageEvent.delta,
            });
          }
          break;

        case "message_end":
          {
            // Emit text-end if we started text
            if (textStarted) {
              emitChunk({ type: "text-end", id: messageId });
              textStarted = false;
            }

            // Token usage is in the message for assistant messages
            const msg = event.message;

            if (msg && msg.role === "assistant" && msg.usage) {
              inputTokens += msg.usage.input || 0;
              outputTokens += msg.usage.output || 0;
            }
          }
          break;

        case "turn_start":
          emitChunk({ type: "start-step" });
          break;

        case "turn_end":
          emitChunk({ type: "finish-step" });
          break;

        case "tool_execution_start":
          emitChunk({
            type: "tool-input-start",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          });

          emitChunk({
            type: "tool-input-available",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.args,
          });
          break;

        case "tool_execution_end":
          emitChunk({
            type: "tool-output-available",
            toolCallId: event.toolCallId,
            output: event.result,
          });
          break;

        case "agent_end":
          emitChunk({ type: "finish", finishReason: "stop" });
          done = true;
          break;
      }
    });

    // Start the prompt (non-blocking)
    const promptPromise = session.prompt(promptText, {
      images: images.length > 0 ? images : undefined,
    });

    // Yield chunks as they arrive
    try {
      while (!done) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
        } else {
          // Wait for next chunk
          await new Promise<void>((resolve) => {
            resolveChunk = resolve;
            // Timeout to prevent hanging
            setTimeout(resolve, 100);
          });
        }
      }

      // Yield remaining chunks
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }

      // Wait for prompt to complete
      await promptPromise;
    } finally {
      unsubscribe();
    }

    // Record telemetry
    recordLLMRequest({
      inputTokens,
      outputTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });

    logger.info(
      {
        sessionId: session.sessionId,
        instanceId,
        inputTokens,
        outputTokens,
      },
      "Chat stream completed",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error, instanceId }, "Chat stream failed");
    yield { type: "error", errorText: errorMessage };
  }
}

/**
 * Generate a single response (non-streaming)
 */
export async function generateChat(request: {
  instanceId: string;
  prompt: string;
  systemPromptOverride?: string;
}): Promise<{
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const { instanceId, prompt } = request;

  const session = await getOrCreateSession(undefined, instanceId);

  // Collect full response
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      fullText += event.assistantMessageEvent.delta;
    }

    if (event.type === "message_end") {
      const msg = event.message;

      if (msg && msg.role === "assistant" && msg.usage) {
        inputTokens = msg.usage.input || 0;
        outputTokens = msg.usage.output || 0;
      }
    }
  });

  try {
    await session.prompt(prompt);
  } finally {
    unsubscribe();
  }

  return {
    text: fullText,
    usage: { inputTokens, outputTokens },
  };
}

/**
 * Clean up old sessions from cache
 */
export function cleanupSessions(): void {
  const now = Date.now();

  for (const [key, info] of activeSessions) {
    if (now - info.lastUsed > SESSION_TIMEOUT_MS) {
      info.session.dispose();
      activeSessions.delete(key);
      logger.debug({ sessionId: key }, "Session cleaned up due to inactivity");
    }
  }
}

/**
 * Dispose all sessions (for shutdown)
 */
export function disposeAllSessions(): void {
  for (const [, info] of activeSessions) {
    info.session.dispose();
  }
  activeSessions.clear();
}

// Start cleanup interval
setInterval(cleanupSessions, SESSION_TIMEOUT_MS / 2);
