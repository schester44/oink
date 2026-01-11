// apps/gateway/src/plugins/adapters/websocket/index.ts

import { createServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { config } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import { eventBus } from "../../event-bus.js";
import type { MessagePlugin, WebSocketPluginConfig, OutgoingMessage, PluginNotification } from "../../types.js";
import { setupSocketHandlers, createOutgoingHandler, createChunkHandler } from "./handlers.js";

const PLUGIN_ID = "websocket";

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

  // Handle notifications (scheduled tasks, reminders, etc.)
  const handleNotification = (notification: PluginNotification): void => {
    if (notification.pluginId !== PLUGIN_ID) return;

    const textContent = notification.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") return;

    // Send to all connected sockets for this instance
    for (const [socketId, socket] of sockets) {
      socket.emit("notification", {
        type: "scheduled-task",
        title: notification.title,
        message: textContent.text,
        instanceId: notification.instanceId,
        priority: notification.priority,
      });
    }

    logger.debug(
      { socketCount: sockets.size, title: notification.title },
      "WebSocket notification sent"
    );
  };
  const notificationHandler = handleNotification;

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

        // Subscribe to outgoing events and notifications
        eventBus.on("outgoing", outgoingHandler);
        eventBus.on("outgoing-chunk", chunkHandler);
        eventBus.on("notification", notificationHandler);

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
        eventBus.off("notification", notificationHandler);

        // Disconnect all sockets first
        for (const [, socket] of sockets) {
          socket.disconnect(true);
        }
        sockets.clear();

        if (io) {
          io.close(() => {
            // Explicitly close the HTTP server to release the port
            if (httpServer) {
              // Force close all connections (Node 18.2+)
              httpServer.closeAllConnections?.();
              httpServer.close(() => {
                logger.info("WebSocket plugin stopped");
                io = null;
                httpServer = null;
                resolve();
              });
            } else {
              logger.info("WebSocket plugin stopped");
              io = null;
              resolve();
            }
          });
        } else if (httpServer) {
          httpServer.closeAllConnections?.();
          httpServer.close(() => {
            logger.info("WebSocket plugin stopped");
            httpServer = null;
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
