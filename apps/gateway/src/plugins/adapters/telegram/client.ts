// apps/gateway/src/plugins/adapters/telegram/client.ts

import { Bot } from "grammy";
import { logger } from "../../../lib/logger.js";
import type { TelegramAdapterConfig } from "./types.js";

export function createTelegramBot(config: TelegramAdapterConfig): Bot {
  const bot = new Bot(config.botToken);

  bot.catch((err) => {
    logger.error({ err }, "Telegram bot error");
  });

  return bot;
}

export async function startBot(bot: Bot): Promise<void> {
  // Start polling for updates
  bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, "Telegram bot launched");
    },
  });
}

export function stopBot(bot: Bot): void {
  bot.stop();
  logger.info("Telegram bot stopped");
}
