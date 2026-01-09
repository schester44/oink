// apps/gateway/src/lib/tasks/dispatcher.ts

import type { Server as SocketServer } from "socket.io";
import { ExecutionResult } from "./types.js";
import { logger } from "../logger.js";

export interface ConnectedClient {
  socketId: string;
  instance: string;
  connectedAt: string;
}

export interface Channel {
  name: string;
  isAvailable: (instance: string) => boolean;
  send: (result: ExecutionResult) => Promise<boolean>;
}

// Client registry
const clients = new Map<string, ConnectedClient>();

export function registerClient(socketId: string, instance: string): void {
  clients.set(socketId, {
    socketId,
    instance,
    connectedAt: new Date().toISOString(),
  });

  logger.info({ socketId, instance }, "Client registered");
}

export function unregisterClient(socketId: string): void {
  const client = clients.get(socketId);

  if (client) {
    clients.delete(socketId);
    logger.info({ socketId, instance: client.instance }, "Client unregistered");
  }
}

export function getClientsForInstance(instance: string): ConnectedClient[] {
  return Array.from(clients.values()).filter((c) => c.instance === instance);
}

export function getConnectedClientCount(): number {
  return clients.size;
}

// Dispatcher
let io: SocketServer | null = null;

export function setSocketServer(server: SocketServer): void {
  io = server;
}

function createWebSocketChannel(): Channel {
  return {
    name: "websocket",
    isAvailable: (instance: string) =>
      getClientsForInstance(instance).length > 0,
    send: async (result: ExecutionResult) => {
      if (!io) {
        logger.warn("WebSocket server not initialized");

        return false;
      }

      const instanceClients = getClientsForInstance(result.instance);

      if (instanceClients.length === 0) {
        logger.debug(
          { instance: result.instance },
          "No clients connected for instance",
        );

        return false;
      }

      for (const client of instanceClients) {
        io.to(client.socketId).emit("scheduled-task", {
          ...result,
          messageType: "scheduled-task",
        });
      }

      logger.info(
        {
          taskId: result.taskId,
          instance: result.instance,
          clientCount: instanceClients.length,
        },
        "Dispatched to WebSocket clients",
      );

      return true;
    },
  };
}

const channels: Channel[] = [createWebSocketChannel()];

export async function dispatch(
  result: ExecutionResult,
  taskChannels?: string[],
): Promise<void> {
  const channelsToUse = taskChannels || ["websocket"];

  for (const channelName of channelsToUse) {
    const channel = channels.find((c) => c.name === channelName);

    if (!channel) {
      logger.warn({ channelName }, "Unknown channel");
      continue;
    }

    if (!channel.isAvailable(result.instance)) {
      logger.debug(
        { channelName, instance: result.instance },
        "Channel not available",
      );
      continue;
    }

    const success = await channel.send(result);

    if (success) {
      logger.debug({ channelName }, "Dispatch successful");

      return; // Stop on first success (unless high priority - future feature)
    }
  }

  logger.warn({ taskId: result.taskId }, "No channels available for dispatch");
}
