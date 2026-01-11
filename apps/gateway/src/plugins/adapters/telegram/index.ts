// apps/gateway/src/plugins/adapters/telegram/index.ts

import { Bot } from "grammy";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import type { MessagePlugin, OutgoingMessage, PluginNotification, TelegramPluginConfig } from "../../types.js";
import type { TelegramAdapterConfig } from "./types.js";
import { createTelegramBot, startBot, stopBot } from "./client.js";
import { setupMessageHandlers } from "./handlers.js";
import { formatForTelegram, splitMessage } from "./formatting.js";

const PLUGIN_ID = "telegram";

export function create(
  pluginConfig: TelegramPluginConfig,
  _eventBus: typeof eventBus
): MessagePlugin {
  const config = pluginConfig as TelegramAdapterConfig;
  let bot: Bot | null = null;

  const handleOutgoing = async (message: OutgoingMessage): Promise<void> => {
    if (message.pluginId !== PLUGIN_ID) return;
    if (!message.isComplete) return; // Only send complete messages
    if (!bot) return;

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") return;

    try {
      const formatted = formatForTelegram(textContent.text);
      const chunks = splitMessage(formatted);

      for (const chunk of chunks) {
        await bot.api.sendMessage(message.chatId, chunk, {
          parse_mode: "MarkdownV2",
        });
      }
    } catch (error) {
      logger.error({ error, chatId: message.chatId }, "Failed to send Telegram message");

      // Fallback: try sending without formatting
      try {
        const textContent = message.content.find((c) => c.type === "text");
        if (textContent && textContent.type === "text") {
          await bot.api.sendMessage(message.chatId, textContent.text);
        }
      } catch (fallbackError) {
        logger.error({ error: fallbackError, chatId: message.chatId }, "Fallback send also failed");
      }
    }
  };

  const handleNotification = async (notification: PluginNotification): Promise<void> => {
    if (notification.pluginId !== PLUGIN_ID) return;
    if (!bot) return;

    const textContent = notification.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") return;

    try {
      const chatId = notification.chatId || config.notificationChatId;
      if (!chatId) {
        logger.warn("No chat ID for notification");
        return;
      }

      let text = textContent.text;
      if (notification.title) {
        text = `*${formatForTelegram(notification.title)}*\n\n${formatForTelegram(text)}`;
      } else {
        text = formatForTelegram(text);
      }

      await bot.api.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      logger.error({ error }, "Failed to send Telegram notification");
    }
  };

  // Store handler references for cleanup
  const outgoingHandler = handleOutgoing;
  const notificationHandler = handleNotification;

  return {
    id: PLUGIN_ID,

    async start(): Promise<void> {
      bot = createTelegramBot(config);
      setupMessageHandlers(bot, config);

      eventBus.on("outgoing", outgoingHandler);
      eventBus.on("notification", notificationHandler);

      await startBot(bot);
      logger.info({ instanceId: config.instanceId }, "Telegram plugin started");
    },

    async stop(): Promise<void> {
      eventBus.off("outgoing", outgoingHandler);
      eventBus.off("notification", notificationHandler);

      if (bot) {
        stopBot(bot);
        bot = null;
      }
      logger.info("Telegram plugin stopped");
    },

    async send(chatId: string, message: OutgoingMessage): Promise<void> {
      if (!bot) {
        logger.warn("Bot not initialized");
        return;
      }

      const textContent = message.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") return;

      const formatted = formatForTelegram(textContent.text);
      await bot.api.sendMessage(chatId, formatted, {
        parse_mode: "MarkdownV2",
      });
    },

    async sendNotification(chatId: string, notification: PluginNotification): Promise<void> {
      if (!bot) return;

      const textContent = notification.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") return;

      let text = textContent.text;
      if (notification.title) {
        text = `*${formatForTelegram(notification.title)}*\n\n${formatForTelegram(text)}`;
      } else {
        text = formatForTelegram(text);
      }

      await bot.api.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
      });
    },
  };
}
