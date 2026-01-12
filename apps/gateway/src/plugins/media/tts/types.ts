// apps/gateway/src/plugins/media/tts/types.ts

export interface TTSResult {
  audioPath: string;
  mimeType: string;
  durationMs?: number;
}

export interface TTSProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  /**
   * Initialize the provider (e.g., check API keys)
   */
  initialize(): Promise<void>;

  /**
   * Convert text to speech
   */
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;

  /**
   * Clean up resources
   */
  shutdown(): Promise<void>;
}

export interface TTSOptions {
  /** Voice ID or name */
  voice?: string;
  /** Speech speed (0.5 - 2.0, default 1.0) */
  speed?: number;
  /** Output format preference */
  format?: "mp3" | "ogg" | "wav";
}

export interface TTSConfig {
  enabled: boolean;
  provider: "elevenlabs" | "openai" | "auto";
  /** Only reply with voice if user sent voice message */
  voiceReplyOnly?: boolean;
  elevenlabs?: ElevenLabsConfig;
  openai?: OpenAITTSConfig;
}

export interface ElevenLabsConfig {
  apiKey?: string; // Falls back to ELEVENLABS_API_KEY env var
  voiceId?: string; // Default voice ID
  modelId?: string; // e.g., "eleven_monolingual_v1"
  stability?: number; // 0-1
  similarityBoost?: number; // 0-1
}

export interface OpenAITTSConfig {
  apiKey?: string; // Falls back to OPENAI_API_KEY env var
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  model?: "tts-1" | "tts-1-hd";
  speed?: number; // 0.25 - 4.0
}
