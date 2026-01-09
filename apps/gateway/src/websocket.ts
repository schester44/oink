import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import {
  registerClient,
  unregisterClient,
  setSocketServer,
  getConnectedClientCount,
} from "./tasks/dispatcher.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { streamChat } from "./chat/service.js";
import { ChatRequest } from "./chat/types.js";

let httpServer: ReturnType<typeof createServer> | null = null;
let io: SocketServer | null = null;

export function startWebSocketServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer = createServer();

    io = new SocketServer(httpServer, {
      cors: {
        origin: "*", // Configure appropriately for production
        methods: ["GET", "POST"],
      },
    });

    setSocketServer(io);

    io.on("connection", (socket) => {
      let instance =
        (socket.handshake.query.instance as string) || config.defaultInstance;

      registerClient(socket.id, instance);

      socket.on("disconnect", () => {
        unregisterClient(socket.id);
      });

      // Allow clients to switch instances
      socket.on("switch-instance", (newInstance: string) => {
        unregisterClient(socket.id);
        registerClient(socket.id, newInstance);
        instance = newInstance;
        socket.emit("instance-switched", { instance: newInstance });
      });

      // Ping/pong for connection health
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: Date.now() });
      });

      // Handle chat messages - stream responses back to client
      socket.on(
        "chat",
        async (data: {
          instanceId?: string;
          sessionId?: string;
          message: ChatRequest["message"];
        }) => {
          const requestInstanceId = data.instanceId || instance;
          const chatRequest: ChatRequest = {
            sessionId: data.sessionId,
            instanceId: requestInstanceId,
            message: data.message,
          };

          logger.debug(
            { sessionId: data.sessionId, instanceId: requestInstanceId },
            "Chat request received",
          );

          try {
            for await (const chunk of streamChat(chatRequest)) {
              socket.emit("chat-chunk", chunk);

              // If this is the finish chunk, also emit a completion event
              // UIMessageChunk uses "finish" instead of "done"
              if (chunk.type === "finish") {
                socket.emit("chat-complete", {
                  sessionId: data.sessionId,
                  finishReason: chunk.finishReason,
                });
              }
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error({ error, instance }, "Chat streaming error");
            socket.emit("chat-chunk", { type: "error", error: errorMessage });
          }
        },
      );
    });

    httpServer.on("error", (error) => {
      reject(error);
    });

    httpServer.listen(config.wsPort, () => {
      logger.info({ port: config.wsPort }, "WebSocket server started");
      resolve();
    });
  });
}

export function stopWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (io) {
      io.close(() => {
        logger.info("WebSocket server closed");
        io = null;
        httpServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function getWebSocketStats(): {
  connectedClients: number;
  port: number;
} {
  return {
    connectedClients: getConnectedClientCount(),
    port: config.wsPort,
  };
}
