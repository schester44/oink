// apps/gateway/src/tasks/dispatcher.ts
//
// Dispatcher sends task results as chat messages via the plugin event bus.
// Each plugin (websocket, telegram, etc.) handles message delivery
// by listening to the "outgoing" event on the event bus.

import { ExecutionResult } from "./types.js";
import { logger } from "../logger.js";
import { eventBus } from "../plugins/event-bus.js";
import type { OutgoingMessage } from "../plugins/types.js";

/**
 * Dispatch task execution results as chat messages via the plugin event bus.
 *
 * Results are sent as regular outgoing messages, appearing in the chat
 * like any other assistant response.
 *
 * @param result - The task execution result (includes channels, chatId, sessionId)
 */
export async function dispatch(result: ExecutionResult): Promise<void> {
  const channels = result.channels || ["websocket"];

  for (const pluginId of channels) {
    const message: OutgoingMessage = {
      sessionId: result.sessionId || "",
      chatId: result.chatId || "",
      pluginId,
      content: [{ type: "text", text: result.output || "Task completed" }],
      isStreaming: false,
      isComplete: true,
    };

    eventBus.emit("outgoing", message);

    logger.debug(
      { pluginId, taskId: result.taskId, chatId: result.chatId },
      "Task result dispatched as message",
    );
  }
}
