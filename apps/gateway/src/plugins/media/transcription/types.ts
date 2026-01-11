// apps/gateway/src/plugins/media/transcription/types.ts

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  /**
   * Initialize the provider (e.g., load model, check dependencies)
   */
  initialize(): Promise<void>;

  /**
   * Transcribe an audio file
   */
  transcribe(audioPath: string): Promise<TranscriptionResult>;

  /**
   * Clean up resources
   */
  shutdown(): Promise<void>;
}

export interface TranscriptionConfig {
  provider: "local-whisper" | "openai-whisper" | "auto";
  localWhisper?: LocalWhisperConfig;
  openaiWhisper?: OpenAIWhisperConfig;
}

export interface LocalWhisperConfig {
  /** Path to whisper model file (e.g., ggml-base.en.bin) */
  modelPath?: string;
  /** Model size to auto-download: tiny, base, small, medium, large */
  modelSize?: "tiny" | "tiny.en" | "base" | "base.en" | "small" | "small.en" | "medium" | "medium.en" | "large";
  /** Language code (e.g., "en") or "auto" for auto-detect */
  language?: string;
  /** Number of threads to use */
  threads?: number;
}

export interface OpenAIWhisperConfig {
  apiKey?: string; // Falls back to OPENAI_API_KEY env var
  model?: string; // Default: whisper-1
}
