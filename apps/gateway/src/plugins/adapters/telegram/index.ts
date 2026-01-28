// apps/gateway/src/plugins/adapters/telegram/index.ts

import { createReadStream } from "fs";
import { Bot, InputFile } from "grammy";
import { eventBus } from "../../event-bus.js";
import { ttsService } from "../../media/index.js";
import { logger } from "../../../lib/logger.js";
import type {
  MessagePlugin,
  OutgoingMessage,
  PluginNotification,
  TelegramPluginConfig,
} from "../../types.js";
import type { TelegramAdapterConfig } from "./types.js";
import { createTelegramBot, startBot, stopBot } from "./client.js";
import { setupMessageHandlers } from "./handlers.js";
import { formatForTelegram, splitMessage } from "./formatting.js";

const PLUGIN_ID = "telegram";

// Track active typing indicators per chat
// Telegram typing indicators expire after ~5 seconds, so we refresh them
const TYPING_INTERVAL_MS = 4000;

export function create(
  pluginConfig: TelegramPluginConfig,
  _eventBus: typeof eventBus,
): MessagePlugin {
  const config = pluginConfig as TelegramAdapterConfig;
  let bot: Bot | null = null;

  // Track typing indicator intervals per chat
  const typingIntervals = new Map<string, NodeJS.Timeout>();

  const startTypingIndicator = async (chatId: string): Promise<void> => {
    if (!bot || typingIntervals.has(chatId)) return;

    // Send initial typing action
    try {
      await bot.api.sendChatAction(chatId, "typing");
    } catch (error) {
      logger.debug({ error, chatId }, "Failed to send typing indicator");

      return;
    }

    // Set up interval to keep typing indicator alive
    const interval = setInterval(async () => {
      if (!bot) {
        stopTypingIndicator(chatId);

        return;
      }

      try {
        await bot.api.sendChatAction(chatId, "typing");
      } catch (error) {
        logger.debug({ error, chatId }, "Failed to refresh typing indicator");
        stopTypingIndicator(chatId);
      }
    }, TYPING_INTERVAL_MS);

    typingIntervals.set(chatId, interval);
  };

  const stopTypingIndicator = (chatId: string): void => {
    const interval = typingIntervals.get(chatId);

    if (interval) {
      clearInterval(interval);
      typingIntervals.delete(chatId);
    }
  };

  const stopAllTypingIndicators = (): void => {
    for (const [chatId] of typingIntervals) {
      stopTypingIndicator(chatId);
    }
  };

  const handleOutgoingChunk = async (
    message: OutgoingMessage,
  ): Promise<void> => {
    if (message.pluginId !== PLUGIN_ID) return;
    if (!bot) return;

    const chunk = message.rawChunk as { type: string } | undefined;
    if (!chunk) return;

    // Start typing when tool execution begins
    if (chunk.type === "tool-input-start") {
      await startTypingIndicator(message.chatId);
    }

    // Also start on text-start in case there's a lot of text generation
    if (chunk.type === "text-start") {
      await startTypingIndicator(message.chatId);
    }

    // Stop typing on terminal events (finish, error)
    // This ensures typing stops even if the complete outgoing message isn't sent
    if (chunk.type === "finish" || chunk.type === "error") {
      stopTypingIndicator(message.chatId);
    }
  };

  const handleOutgoing = async (message: OutgoingMessage): Promise<void> => {
    if (message.pluginId !== PLUGIN_ID) return;
    if (!message.isComplete) return; // Only send complete messages
    if (!bot) return;

    // Stop typing indicator when message is complete
    stopTypingIndicator(message.chatId);

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") return;

    const text = textContent.text;

    // Send voice message if TTS is enabled and appropriate
    if (message.respondWithVoice && ttsService.isEnabled()) {
      try {
        logger.debug({ chatId: message.chatId, textLength: text.length }, "Generating TTS audio");
        const ttsResult = await ttsService.synthesize(text, { format: "mp3" });
        
        // Send as voice message
        await bot.api.sendVoice(
          message.chatId,
          new InputFile(createReadStream(ttsResult.audioPath)),
          { message_thread_id: message.topicId },
        );
        
        logger.debug({ chatId: message.chatId, audioPath: ttsResult.audioPath }, "Voice message sent");
        return; // Don't send text if voice was sent
      } catch (error) {
        logger.error({ error, chatId: message.chatId }, "TTS failed, falling back to text");
        // Fall through to send text instead
      }
    }

    // Send text message
    try {
      const formatted = formatForTelegram(text);
      const chunks = splitMessage(formatted);

      for (const chunk of chunks) {
        await bot.api.sendMessage(message.chatId, chunk, {
          parse_mode: "MarkdownV2",
          message_thread_id: message.topicId,
        });
      }
    } catch (error) {
      logger.error(
        { error, chatId: message.chatId, topicId: message.topicId },
        "Failed to send Telegram message",
      );

      // Fallback: try sending without formatting
      try {
        await bot.api.sendMessage(message.chatId, text, {
          message_thread_id: message.topicId,
        });
      } catch (fallbackError) {
        logger.error(
          { error: fallbackError, chatId: message.chatId },
          "Fallback send also failed",
        );
      }
    }
  };

  const handleNotification = async (
    notification: PluginNotification,
  ): Promise<void> => {
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
  const outgoingChunkHandler = handleOutgoingChunk;
  const notificationHandler = handleNotification;

  return {
    id: PLUGIN_ID,

    async start(): Promise<void> {
      bot = createTelegramBot(config);
      setupMessageHandlers(bot, config);

      eventBus.on("outgoing", outgoingHandler);
      eventBus.on("outgoing-chunk", outgoingChunkHandler);
      eventBus.on("notification", notificationHandler);

      await startBot(bot);
      logger.info({ instanceId: config.instanceId }, "Telegram plugin started");
    },

    async stop(): Promise<void> {
      eventBus.off("outgoing", outgoingHandler);
      eventBus.off("outgoing-chunk", outgoingChunkHandler);
      eventBus.off("notification", notificationHandler);

      stopAllTypingIndicators();

      if (bot) {
        stopBot(bot);
        bot = null;
      }
      logger.info("Telegram plugin stopped");
    },

    async send(chatId: string, message: OutgoingMessage): Promise<void> {
      console.log("\x1b[33m%s\x1b[0m", "🪵 message", message);
      console.log("\x1b[33m%s\x1b[0m", "🪵 chatId", chatId);
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

    async sendNotification(
      chatId: string,
      notification: PluginNotification,
    ): Promise<void> {
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
