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
import { existsSync, mkdirSync, readdirSync } from "fs";

import { getSessionsDir, getWorkspaceDir, config } from "../config.js";
import { buildSystemPrompt } from "../chat/prompts.js";
import { logger } from "../logger.js";
import { readSettings } from "../lib/settings.js";
import { recordLLMRequest } from "../lib/telemetry/index.js";
import { initializeBrain } from "../brain/brain.js";
import { createCronToolDefinition } from "./tools/cron-pi.js";
import { createResponseModeToolDefinition, getResponseModePreference, type ResponseMode } from "./tools/response-mode.js";

// Re-export for use by chat-handler
export { getResponseModePreference, type ResponseMode };

// Time gap constants
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get the timestamp of the last user message in the session.
 * Returns undefined if no user messages exist.
 */
function getLastUserMessageTimestamp(session: AgentSession): number | undefined {
  const messages = session.messages;
  
  // Find the last user message (iterate backwards)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === "user" && "timestamp" in msg && typeof msg.timestamp === "number") {
      return msg.timestamp;
    }
  }
  
  return undefined;
}

/**
 * Format a time duration into a human-readable string.
 */
function formatTimeDuration(ms: number): string {
  const days = Math.floor(ms / ONE_DAY_MS);
  const hours = Math.floor((ms % ONE_DAY_MS) / (60 * 60 * 1000));
  
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    if (remainingDays === 0) {
      return weeks === 1 ? "1 week" : `${weeks} weeks`;
    }
    return `${weeks} week${weeks > 1 ? "s" : ""} and ${remainingDays} day${remainingDays > 1 ? "s" : ""}`;
  }
  
  if (days > 0) {
    if (hours === 0) {
      return days === 1 ? "1 day" : `${days} days`;
    }
    return `${days} day${days > 1 ? "s" : ""} and ${hours} hour${hours > 1 ? "s" : ""}`;
  }
  
  return `${hours} hour${hours > 1 ? "s" : ""}`;
}

/**
 * Build a time gap indicator if significant time has passed since last message.
 * Returns undefined if less than 1 day has passed.
 */
function buildTimeGapIndicator(
  lastMessageTimestamp: number | undefined,
  currentTimestamp: number,
): string | undefined {
  if (lastMessageTimestamp === undefined) {
    return undefined;
  }
  
  const timeDiff = currentTimestamp - lastMessageTimestamp;
  
  if (timeDiff < ONE_DAY_MS) {
    return undefined;
  }
  
  const duration = formatTimeDuration(timeDiff);
  const lastDate = new Date(lastMessageTimestamp);
  const formattedDate = lastDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  
  return `[Note: It has been ${duration} since our last conversation (${formattedDate}). The user is returning after some time away.]`;
}

interface ChatContextOptions {
  chatMetadata?: ChatMetadata;
  sender?: { name?: string; username?: string };
  /** Whether the user sent a voice message */
  userSentVoice?: boolean;
  /** Whether the response will be converted to speech */
  responseWillBeSpoken?: boolean;
}

/**
 * Build a chat context indicator for platform-specific metadata.
 * Returns undefined if no relevant metadata is present.
 */
function buildChatContextIndicator(options: ChatContextOptions): string | undefined {
  const { chatMetadata, sender, userSentVoice, responseWillBeSpoken } = options;
  
  // If no metadata and no voice context, nothing to add
  if (!chatMetadata && !userSentVoice && !responseWillBeSpoken) {
    return undefined;
  }

  const parts: string[] = [];
  
  if (chatMetadata) {
    // Platform and chat type
    const platform = chatMetadata.platform.charAt(0).toUpperCase() + chatMetadata.platform.slice(1);
    
    if (chatMetadata.type === "private") {
      parts.push(`${platform} DM`);
    } else if (chatMetadata.title) {
      parts.push(`${platform} ${chatMetadata.type} "${chatMetadata.title}"`);
    } else {
      parts.push(`${platform} ${chatMetadata.type}`);
    }
    
    // Topic info (for forum topics in supergroups)
    if (chatMetadata.topicId) {
      if (chatMetadata.topicName) {
        parts.push(`topic: "${chatMetadata.topicName}"`);
      } else {
        parts.push(`topic #${chatMetadata.topicId}`);
      }
    }
    
    // Sender info (useful in groups)
    if (sender?.name || sender?.username) {
      const senderStr = sender.name || `@${sender.username}`;
      parts.push(`from: ${senderStr}`);
    }
  }
  
  // Voice context
  if (userSentVoice) {
    parts.push("user sent voice message");
  }
  if (responseWillBeSpoken) {
    parts.push("response will be spoken aloud via TTS - keep it conversational and avoid markdown/formatting");
  }
  
  return parts.length > 0 ? `[${parts.join(" | ")}]` : undefined;
}

// Re-export event types for consumers
export type { AgentSessionEvent };

/**
 * StreamChunk - AI SDK UIMessageChunk compatible format
 * These chunks are sent to the frontend and must match what useChat expects
 */
export type StreamChunk =
  | { type: "start"; messageId?: string; sessionId?: string }
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

/** Metadata about the chat context */
export interface ChatMetadata {
  /** Chat type: private DM, group, supergroup, channel */
  type: "private" | "group" | "supergroup" | "channel";
  /** Chat/group title (for groups/channels) */
  title?: string;
  /** Platform-specific (e.g., "telegram", "discord") */
  platform: string;
  /** Topic/thread ID (for forum topics in supergroups) */
  topicId?: number;
  /** Topic name (if available) */
  topicName?: string;
}

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
  /** Metadata about the chat context (for Telegram, Discord, etc.) */
  chatMetadata?: ChatMetadata;
  /** Info about who sent the message */
  sender?: {
    name?: string;
    username?: string;
  };
  /** Whether the user sent a voice message */
  userSentVoice?: boolean;
  /** Whether the response will be converted to speech */
  responseWillBeSpoken?: boolean;
}

interface SessionInfo {
  session: AgentSession;
  instanceId: string;
  lastUsed: number;
}

// Cache of active sessions by external session ID (e.g., "telegram:12345")
const activeSessions = new Map<string, SessionInfo>();

// Session cleanup interval (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Get session directory for an external session ID.
 * Each external session (e.g., telegram chat) gets its own directory.
 */
function getExternalSessionDir(
  instanceId: string,
  externalSessionId: string,
): string {
  // Sanitize the external ID for use as directory name
  const safeId = externalSessionId.replace(/[^a-zA-Z0-9_-]/g, "_");

  return join(getSessionsDir(instanceId), safeId);
}

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
 * Check if a session ID represents an external channel (telegram, etc.)
 * External channels get their own subdirectory for session isolation.
 */
function isExternalChannelSession(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  // External channels use format like "telegram:12345"
  // Web/websocket sessions are UUIDs or start with "web:"
  return sessionId.includes(":") && 
    !sessionId.startsWith("web:") && 
    !sessionId.startsWith("websocket:");
}

/**
 * Find a session file by ID in a directory
 */
function findSessionFile(sessionsDir: string, sessionId: string): string | null {
  if (!existsSync(sessionsDir)) return null;
  
  const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
  const match = files.find((f) => f.includes(sessionId));
  
  return match ? join(sessionsDir, match) : null;
}

/**
 * Get or create an agent session.
 *
 * Session handling:
 * - External channels (telegram:*, etc.): Own subdirectory, continueRecent() 
 * - Web/websocket with existing sessionId: Open that specific session
 * - Web/websocket without sessionId: Create new session
 * 
 * The backend owns session ID creation - returns session.sessionId as source of truth.
 */
async function getOrCreateSession(
  requestedSessionId: string | undefined,
  instanceId: string,
  sourceChannel?: string,
  chatId?: string,
): Promise<AgentSession> {
  const isExternalChannel = isExternalChannelSession(requestedSessionId);
  
  // For external channels, use the channel ID as cache key
  // For web sessions, use the requested session ID (if opening existing) or we'll cache by actual ID later
  const cacheKey = requestedSessionId || "_new_";
  
  // Check cache first
  const cached = activeSessions.get(cacheKey);
  if (cached && cached.instanceId === instanceId) {
    cached.lastUsed = Date.now();
    logger.debug({ requestedSessionId, instanceId }, "Using cached session");
    return cached.session;
  }

  // Initialize brain files
  await initializeBrain({
    brainTemplatesDir: config.templatesDir,
    systemSkillsDir: config.systemSkillsDir,
    instanceId,
  });

  const workspaceDir = getWorkspaceDir(instanceId);
  const mainSessionsDir = ensureSessionsDir(instanceId);

  // Determine sessions directory and session manager strategy
  let sessionsDir: string;
  let sessionManager: ReturnType<typeof SessionManager.create | typeof SessionManager.open>;

  if (isExternalChannel) {
    // External channels: own subdirectory, always continue recent
    sessionsDir = getExternalSessionDir(instanceId, requestedSessionId!);
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }
    sessionManager = SessionManager.continueRecent(workspaceDir, sessionsDir);
  } else if (requestedSessionId) {
    // Web with specific session ID: try to open existing
    sessionsDir = mainSessionsDir;
    const sessionFile = findSessionFile(sessionsDir, requestedSessionId);
    
    if (sessionFile) {
      sessionManager = SessionManager.open(sessionFile, sessionsDir);
    } else {
      // Session doesn't exist, create new
      sessionManager = SessionManager.create(workspaceDir, sessionsDir);
    }
  } else {
    // No session ID: create new
    sessionsDir = mainSessionsDir;
    sessionManager = SessionManager.create(workspaceDir, sessionsDir);
  }

  logger.debug(
    {
      requestedSessionId,
      actualSessionId: sessionManager.getSessionId(),
      sessionsDir,
    },
    "Session manager ready",
  );

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

  // Load settings from ~/.pinky/ directory
  const settingsManager = SettingsManager.create(workspaceDir, config.dataDir);

  // Create cron tool
  const cronTool = createCronToolDefinition({
    instanceId,
    sourceChannel,
    chatId,
  });

  // Create response mode tool (uses the external session ID for preference storage)
  const responseModeTool = createResponseModeToolDefinition({
    sessionId: requestedSessionId || sessionManager.getSessionId(),
  });

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

  // Create custom tools
  const customTools = [
    cronTool as unknown as ToolDefinition,
    responseModeTool as unknown as ToolDefinition,
  ];

  logger.debug(
    { customToolNames: customTools.map(t => t.name) },
    "Registering custom tools"
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
    customTools,
    extensions: [],
    skills,
    contextFiles: [],
    promptTemplates: [],
    sessionManager,
    settingsManager,
  });

  // Cache by the actual session ID (backend is source of truth)
  // For external channels, also cache by the channel ID for quick lookup
  activeSessions.set(session.sessionId, {
    session,
    instanceId,
    lastUsed: Date.now(),
  });
  
  if (isExternalChannel && requestedSessionId) {
    activeSessions.set(requestedSessionId, {
      session,
      instanceId,
      lastUsed: Date.now(),
    });
  }

  logger.info(
    { requestedSessionId, sessionId: session.sessionId, instanceId },
    "Session ready",
  );

  return session;
}

/**
 * Stream a chat response using pi-coding-agent
 * Emits AI SDK UIMessageChunk compatible chunks for the frontend
 */
export async function* streamChat(
  request: ChatRequest,
): AsyncGenerator<StreamChunk> {
  const { sessionId, instanceId, message, sourceChannel, chatId, chatMetadata, sender } = request;

  try {
    const session = await getOrCreateSession(
      sessionId,
      instanceId,
      sourceChannel,
      chatId,
    );

    // Build context indicators
    const lastUserTimestamp = getLastUserMessageTimestamp(session);
    const currentTimestamp = Date.now();
    const timeGapIndicator = buildTimeGapIndicator(lastUserTimestamp, currentTimestamp);
    const chatContextIndicator = buildChatContextIndicator({
      chatMetadata,
      sender,
      userSentVoice: request.userSentVoice,
      responseWillBeSpoken: request.responseWillBeSpoken,
    });
    
    // Build prompt content, prepending context indicators if present
    const contextParts: string[] = [];
    if (chatContextIndicator) {
      contextParts.push(chatContextIndicator);
    }
    if (timeGapIndicator) {
      contextParts.push(timeGapIndicator);
    }
    
    const promptText = contextParts.length > 0
      ? `${contextParts.join("\n")}\n\n${message.content}`
      : message.content;
    
    if (contextParts.length > 0) {
      logger.debug(
        { 
          chatContextIndicator,
          timeGapIndicator,
          lastUserTimestamp, 
          currentTimestamp, 
          daysSince: lastUserTimestamp ? Math.floor((currentTimestamp - lastUserTimestamp) / ONE_DAY_MS) : null 
        },
        "Context indicators added to prompt",
      );
    }

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
          // Emit start chunk at the very beginning with the actual session ID
          if (!streamStarted) {
            streamStarted = true;

            emitChunk({
              type: "start",
              messageId,
              sessionId: session.sessionId,
            });
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
