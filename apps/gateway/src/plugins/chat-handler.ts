// apps/gateway/src/plugins/chat-handler.ts

import { readFile } from "fs/promises";
import { eventBus } from "./event-bus.js";
import { streamChat, type StreamChunk, type ChatRequest, getResponseModePreference } from "../agent/agent-service.js";
import { logger } from "../lib/logger.js";
import { ttsService } from "./media/index.js";
import type { NormalizedMessage, MessageContent } from "./types.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType: string };

/**
 * Convert NormalizedMessage content to ChatMessage parts for the LLM.
 * Handles text, images (for vision), and audio (transcription).
 */
async function buildChatMessageParts(content: MessageContent[]): Promise<MessagePart[]> {
  const parts: MessagePart[] = [];

  for (const item of content) {
    switch (item.type) {
      case "text":
        parts.push({ type: "text", text: item.text });
        break;
      case "image":
        try {
          // Read image file and convert to base64 data URL for vision
          const imageBuffer = await readFile(item.localPath);
          const base64 = imageBuffer.toString("base64");
          parts.push({
            type: "image",
            image: base64,
            mimeType: item.mimeType,
          });
          logger.debug({ path: item.localPath, mimeType: item.mimeType }, "Image loaded for vision");
        } catch (error) {
          logger.error({ error, path: item.localPath }, "Failed to read image for vision");
          parts.push({ type: "text", text: `[Failed to load image: ${item.localPath}]` });
        }
        break;
      case "audio":
        if (item.transcription) {
          parts.push({ type: "text", text: `[Voice message]: ${item.transcription}` });
        } else {
          parts.push({ type: "text", text: `[Audio attached: ${item.localPath}]` });
        }
        break;
      case "file":
        parts.push({ type: "text", text: `[File attached: ${item.filename}]` });
        break;
    }
  }

  return parts;
}

async function handleIncoming(message: NormalizedMessage): Promise<void> {
  logger.debug(
    {
      pluginId: message.pluginId,
      chatId: message.chatId,
      sessionId: message.sessionId,
      hasVoice: message.hasVoice,
    },
    "Processing incoming message",
  );

  // Check user's response mode preference for this session
  const responseMode = getResponseModePreference(message.sessionId);
  
  // Check for one-time voice request phrases in the message
  const textForDetection = message.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join(" ")
    .toLowerCase();
  
  const voiceRequestPhrases = [
    "voice memo",
    "audio response", 
    "respond with audio",
    "respond in audio",
    "reply with audio",
    "reply in audio",
    "say it out loud",
    "tell me in audio",
    "speak your response",
    "use voice",
    "use audio",
    "as audio",
    "as a voice",
    "in voice",
  ];
  
  const requestedVoiceThisMessage = ttsService.isEnabled() && 
    voiceRequestPhrases.some(phrase => textForDetection.includes(phrase));
  
  // Determine if we should respond with voice
  let shouldRespondWithVoice: boolean;
  if (requestedVoiceThisMessage) {
    // One-time voice request for this message
    shouldRespondWithVoice = true;
  } else if (responseMode === "voice") {
    // User explicitly requested voice responses via tool
    shouldRespondWithVoice = ttsService.isEnabled();
  } else if (responseMode === "text") {
    // User explicitly requested text responses
    shouldRespondWithVoice = false;
  } else {
    // Auto mode: use default behavior (voice replies to voice if enabled)
    shouldRespondWithVoice = ttsService.isEnabled() && 
      (!ttsService.isVoiceReplyOnly() || message.hasVoice);
  }

  // Build multimodal parts (text + images) for vision support
  const parts = await buildChatMessageParts(message.content);

  // Extract text content for backward compatibility
  const textContent = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  const chatRequest: ChatRequest = {
    sessionId: message.sessionId,
    instanceId: message.instanceId,
    message: {
      id: message.id,
      role: "user",
      content: textContent,
      parts: parts,
    },
    sourceChannel: message.pluginId,
    chatId: message.chatId,
    chatMetadata: message.chatMetadata,
    sender: message.sender,
    userSentVoice: message.hasVoice,
    responseWillBeSpoken: shouldRespondWithVoice,
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Reset collected text for each retry attempt
    const collectedText: string[] = [];

    try {
      for await (const chunk of streamChat(chatRequest)) {
        // Collect text for final message
        if (chunk.type === "text-delta") {
          collectedText.push(chunk.delta as string);
        }

        // Emit streaming chunks with raw chunk for WebSocket passthrough
        eventBus.emit("outgoing-chunk", {
          sessionId: message.sessionId,
          chatId: message.chatId,
          pluginId: message.pluginId,
          content: [
            {
              type: "text",
              text: chunk.type === "text-delta" ? (chunk.delta as string) : "",
            },
          ],
          isStreaming: true,
          isComplete: false,
          rawChunk: chunk,
          respondWithVoice: shouldRespondWithVoice,
          topicId: message.chatMetadata?.topicId,
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
            rawChunk: chunk,
            respondWithVoice: shouldRespondWithVoice,
            topicId: message.chatMetadata?.topicId,
          });
        }
      }

      return; // Success
    } catch (error) {
      logger.error(
        {
          error,
          attempt,
          maxRetries: MAX_RETRIES,
          sessionId: message.sessionId,
        },
        "Chat processing failed",
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
        content: [
          {
            type: "text",
            text: "Sorry, I'm having trouble processing your message. Please try again in a moment.",
          },
        ],
        isStreaming: false,
        isComplete: true,
        topicId: message.chatMetadata?.topicId,
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
