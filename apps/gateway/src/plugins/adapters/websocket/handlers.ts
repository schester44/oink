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

    // Emit completion signal (chunk handler already sent the finish chunk via rawChunk)
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
      socket.emit("chat-chunk", message.rawChunk);
    }
  };
}
