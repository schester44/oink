// Re-export UIMessageChunk from AI SDK for transport-agnostic streaming
// This ensures compatibility with the AI SDK's useChat hook on the frontend

import type { UIMessageChunk } from "ai";

// StreamChunk is now UIMessageChunk from the AI SDK
// Key chunk types include:
// - { type: "text-start", id: string }
// - { type: "text-delta", id: string, delta: string }
// - { type: "text-end", id: string }
// - { type: "tool-input-available", toolCallId: string, toolName: string, input: unknown }
// - { type: "tool-result", toolCallId: string, toolName: string, result: unknown }
// - { type: "start", messageId?: string }
// - { type: "finish", finishReason?: string }
// - { type: "error", errorText: string }
export type StreamChunk = UIMessageChunk | { type: "error"; error: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

export interface ChatRequest {
  sessionId?: string;
  instanceId: string;
  message: ChatMessage;
  /** The plugin/channel that originated this request (e.g., "telegram", "websocket") */
  sourceChannel?: string;
}
