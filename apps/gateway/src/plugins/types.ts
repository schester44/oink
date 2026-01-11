// apps/gateway/src/plugins/types.ts

// === Normalized Message Types ===

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "image"; url?: string; localPath: string; mimeType: string }
  | { type: "audio"; url?: string; localPath: string; mimeType: string; transcription?: string }
  | { type: "file"; url?: string; localPath: string; filename: string; mimeType: string };

export interface MessageSender {
  id: string;
  name?: string;
  username?: string;
}

export interface NormalizedMessage {
  id: string;
  pluginId: string;
  chatId: string;
  sessionId: string;
  instanceId: string;
  sender: MessageSender;
  content: MessageContent[];
  timestamp: Date;
  replyTo?: string;
}

// === Outgoing Message Types ===

export type OutgoingContent =
  | { type: "text"; text: string }
  | { type: "image"; path: string }
  | { type: "file"; path: string; filename: string };

export interface OutgoingMessage {
  sessionId: string;
  chatId: string;
  pluginId: string;
  content: OutgoingContent[];
  isStreaming: boolean;
  isComplete: boolean;
}

// === Notification Types ===

export interface PluginNotification {
  instanceId: string;
  pluginId: string;
  chatId: string;
  title?: string;
  content: OutgoingContent[];
  priority: "normal" | "high";
}

// === Event Bus Types ===

export interface PluginEventMap {
  "incoming": NormalizedMessage;
  "outgoing": OutgoingMessage;
  "outgoing-chunk": OutgoingMessage;
  "notification": PluginNotification;
}

// === Plugin Interface ===

export interface MessagePlugin {
  id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(chatId: string, message: OutgoingMessage): Promise<void>;
  sendNotification?(chatId: string, notification: PluginNotification): Promise<void>;
}

// === Plugin Configuration ===

export interface PluginConfig {
  enabled: boolean;
  instanceId?: string;
  [key: string]: unknown;
}

export interface PluginsConfig {
  plugins: Record<string, PluginConfig>;
}

export interface TelegramPluginConfig extends PluginConfig {
  botToken: string;
  instanceId: string;
  notificationChatId?: string;
}

export interface WebSocketPluginConfig extends PluginConfig {
  // WebSocket uses default instance from gateway config
}
