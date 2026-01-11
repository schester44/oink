// apps/gateway/src/tasks/dispatcher.ts
//
// Dispatcher uses the plugin event bus to send notifications.
// Each plugin (websocket, telegram, etc.) handles its own notification delivery
// by listening to the "notification" event on the event bus.

import { ExecutionResult } from "./types.js";
import { logger } from "../logger.js";
import { eventBus } from "../plugins/event-bus.js";
import type { PluginNotification } from "../plugins/types.js";

/**
 * Dispatch task execution results to notification channels via the plugin event bus.
 *
 * Plugins register themselves to handle notifications by listening to the "notification"
 * event on the event bus. Each plugin filters for its own pluginId.
 *
 * @param result - The task execution result
 * @param channels - Array of plugin IDs to notify (e.g., ["telegram", "websocket"])
 */
export async function dispatch(
  result: ExecutionResult,
  channels: string[] = ["websocket"],
): Promise<void> {
  for (const channelName of channels) {
    const notification: PluginNotification = {
      instanceId: result.instance,
      pluginId: channelName,
      chatId: "", // Plugins use their default/configured chat ID
      title: result.taskName || `Task: ${result.taskId}`,
      content: [
        { type: "text", text: result.output || "Task completed" },
      ],
      priority: "normal",
    };

    eventBus.emit("notification", notification);
    logger.debug(
      { channel: channelName, taskId: result.taskId },
      "Notification dispatched to plugin"
    );
  }
}
