// apps/gateway/src/lib/websocket.ts

import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { registerClient, unregisterClient, setSocketServer, getConnectedClientCount } from "./tasks/dispatcher.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

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
      const instance = (socket.handshake.query.instance as string) || config.defaultInstance;

      registerClient(socket.id, instance);

      socket.on("disconnect", () => {
        unregisterClient(socket.id);
      });

      // Allow clients to switch instances
      socket.on("switch-instance", (newInstance: string) => {
        unregisterClient(socket.id);
        registerClient(socket.id, newInstance);
        socket.emit("instance-switched", { instance: newInstance });
      });

      // Ping/pong for connection health
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: Date.now() });
      });
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

export function getWebSocketStats(): { connectedClients: number; port: number } {
  return {
    connectedClients: getConnectedClientCount(),
    port: config.wsPort,
  };
}
