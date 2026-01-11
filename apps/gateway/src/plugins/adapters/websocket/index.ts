// apps/gateway/src/plugins/adapters/websocket/index.ts

import { createServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { config } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import { eventBus } from "../../event-bus.js";
import type { MessagePlugin, WebSocketPluginConfig, OutgoingMessage } from "../../types.js";
import { setupSocketHandlers, createOutgoingHandler, createChunkHandler } from "./handlers.js";

export function create(
  pluginConfig: WebSocketPluginConfig,
  _eventBus: typeof eventBus
): MessagePlugin {
  let httpServer: ReturnType<typeof createServer> | null = null;
  let io: SocketServer | null = null;
  const sockets = new Map<string, Socket>();

  const getSocket = (chatId: string): Socket | undefined => sockets.get(chatId);

  // Store handler references for proper cleanup
  const outgoingHandler = createOutgoingHandler(getSocket);
  const chunkHandler = createChunkHandler(getSocket);

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
        eventBus.on("outgoing", outgoingHandler);
        eventBus.on("outgoing-chunk", chunkHandler);

        httpServer.on("error", reject);

        httpServer.listen(config.wsPort, () => {
          logger.info({ port: config.wsPort }, "WebSocket plugin started");
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve) => {
        eventBus.off("outgoing", outgoingHandler);
        eventBus.off("outgoing-chunk", chunkHandler);

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

    async send(chatId: string, message: OutgoingMessage): Promise<void> {
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
