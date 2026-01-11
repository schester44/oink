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

    // For scheduled task results (no rawChunk), send the content directly
    if (message.isComplete && !message.rawChunk) {
      const textContent = message.content.find((c) => c.type === "text");
      if (textContent && textContent.type === "text") {
        socket.emit("chat-message", {
          sessionId: message.sessionId,
          role: "assistant",
          content: textContent.text,
        });
      }
    }

    // Emit completion signal
    if (message.isComplete) {
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

    // Pass through raw UIMessageChunk for AI SDK compatibility
    if (message.rawChunk) {
      logger.debug({ chunk: message.rawChunk }, "Emitting chat-chunk");
      socket.emit("chat-chunk", message.rawChunk);
      
      // If this is a start chunk with sessionId, emit a separate session-id event
      // This allows the frontend to update its sessionId to match the actual session
      const chunk = message.rawChunk as { type?: string; sessionId?: string };
      if (chunk.type === "start" && chunk.sessionId) {
        socket.emit("session-id", { sessionId: chunk.sessionId });
      }
    }
  };
}
