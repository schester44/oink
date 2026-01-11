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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Reset collected text for each retry attempt
    const collectedText: string[] = [];

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
