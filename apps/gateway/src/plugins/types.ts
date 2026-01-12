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
  /** True if the original message included voice/audio */
  hasVoice?: boolean;
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
  // Raw UIMessageChunk from AI SDK for WebSocket passthrough
  rawChunk?: unknown;
  /** True if we should respond with voice (user sent voice or TTS always enabled) */
  respondWithVoice?: boolean;
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
  transcription?: {
    provider: "local-whisper" | "openai-whisper" | "auto";
    localWhisper?: {
      modelPath?: string;
      modelSize?: "tiny" | "tiny.en" | "base" | "base.en" | "small" | "small.en" | "medium" | "medium.en" | "large";
      language?: string;
      threads?: number;
    };
    openaiWhisper?: {
      apiKey?: string;
      model?: string;
    };
  };
  tts?: {
    enabled: boolean;
    provider: "elevenlabs" | "openai" | "auto";
    /** Only reply with voice if user sent voice message */
    voiceReplyOnly?: boolean;
    elevenlabs?: {
      apiKey?: string;
      voiceId?: string;
      modelId?: string;
      stability?: number;
      similarityBoost?: number;
    };
    openai?: {
      apiKey?: string;
      voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
      model?: "tts-1" | "tts-1-hd";
      speed?: number;
    };
  };
}

export interface TelegramPluginConfig extends PluginConfig {
  botToken: string;
  instanceId: string;
  notificationChatId?: string;
}

export interface WebSocketPluginConfig extends PluginConfig {
  // WebSocket uses default instance from gateway config
}
