// apps/gateway/src/plugins/adapters/telegram/types.ts

import type { TelegramPluginConfig } from "../../types.js";

export interface TelegramAdapterConfig extends TelegramPluginConfig {
  botToken: string;
  instanceId: string;
  notificationChatId?: string;
}

export interface TelegramContext {
  chatId: string;
  messageId: number;
  userId: string;
  username?: string;
  firstName?: string;
}
