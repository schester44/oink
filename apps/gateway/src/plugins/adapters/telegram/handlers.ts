// apps/gateway/src/plugins/adapters/telegram/handlers.ts

import type { Bot, Context } from "grammy";
import { v4 as uuid } from "uuid";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import type { NormalizedMessage, MessageContent } from "../../types.js";
import type { TelegramAdapterConfig } from "./types.js";
import { handlePhoto, handleVoice, handleAudio, handleDocument } from "./media.js";

const PLUGIN_ID = "telegram";

function buildSessionId(chatId: number): string {
  return `telegram:${chatId}`;
}

function extractSender(ctx: Context): { id: string; name?: string; username?: string } {
  const from = ctx.from;
  return {
    id: String(from?.id || "unknown"),
    name: from?.first_name,
    username: from?.username,
  };
}

async function processMessage(
  ctx: Context,
  config: TelegramAdapterConfig
): Promise<void> {
  const message = ctx.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const content: MessageContent[] = [];

  try {
    // Handle text
    if ("text" in message && message.text) {
      content.push({ type: "text", text: message.text });
    }

    // Handle caption (for media messages)
    if ("caption" in message && message.caption) {
      content.push({ type: "text", text: message.caption });
    }

    // Handle photo
    if ("photo" in message && message.photo) {
      const photoContent = await handlePhoto(ctx, message.photo);
      content.push(photoContent);
    }

    // Handle voice
    if ("voice" in message && message.voice) {
      const voiceContent = await handleVoice(ctx, message.voice);
      content.push(voiceContent);
    }

    // Handle audio
    if ("audio" in message && message.audio) {
      const audioContent = await handleAudio(ctx, message.audio);
      content.push(audioContent);
    }

    // Handle document
    if ("document" in message && message.document) {
      const docContent = await handleDocument(ctx, message.document);
      content.push(docContent);
    }

    if (content.length === 0) {
      logger.debug({ chatId, messageId: message.message_id }, "No processable content");
      return;
    }

    // Check if message contains voice/audio
    const hasVoice = ("voice" in message && !!message.voice) || 
                     ("audio" in message && !!message.audio);

    const normalized: NormalizedMessage = {
      id: uuid(),
      pluginId: PLUGIN_ID,
      chatId,
      sessionId: buildSessionId(message.chat.id),
      instanceId: config.instanceId,
      sender: extractSender(ctx),
      content,
      timestamp: new Date(message.date * 1000),
      replyTo: message.reply_to_message ? String(message.reply_to_message.message_id) : undefined,
      hasVoice,
    };

    logger.debug(
      { chatId, sessionId: normalized.sessionId, contentTypes: content.map(c => c.type) },
      "Telegram message normalized"
    );

    eventBus.emit("incoming", normalized);
  } catch (error) {
    logger.error({ error, chatId }, "Failed to process Telegram message");
    await ctx.reply("Sorry, I couldn't process that message. Please try again.");
  }
}

export function setupMessageHandlers(
  bot: Bot,
  config: TelegramAdapterConfig
): void {
  // Handle text messages
  bot.on("message:text", (ctx) => processMessage(ctx, config));

  // Handle photos
  bot.on("message:photo", (ctx) => processMessage(ctx, config));

  // Handle voice messages
  bot.on("message:voice", (ctx) => processMessage(ctx, config));

  // Handle audio files
  bot.on("message:audio", (ctx) => processMessage(ctx, config));

  // Handle documents
  bot.on("message:document", (ctx) => processMessage(ctx, config));

  logger.info("Telegram message handlers registered");
}
