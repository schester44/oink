// apps/gateway/src/plugins/media/transcription/service.ts

import { logger } from "../../../lib/logger.js";
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionConfig,
} from "./types.js";
import { LocalWhisperProvider } from "./local-whisper-provider.js";
import { OpenAIWhisperProvider } from "./openai-provider.js";

class TranscriptionService {
  private providers = new Map<string, TranscriptionProvider>();
  private activeProvider: TranscriptionProvider | null = null;
  private config: TranscriptionConfig = { provider: "auto" };
  private initialized = false;

  /**
   * Configure the transcription service
   */
  configure(config: TranscriptionConfig): void {
    this.config = config;
    logger.debug({ config }, "Transcription service configured");
  }

  /**
   * Initialize the service and available providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register providers based on config
    if (
      this.config.provider === "local-whisper" ||
      this.config.provider === "auto"
    ) {
      const localProvider = new LocalWhisperProvider(this.config.localWhisper);
      await localProvider.initialize();
      this.providers.set(localProvider.name, localProvider);
    }

    if (
      this.config.provider === "openai-whisper" ||
      this.config.provider === "auto"
    ) {
      const openaiProvider = new OpenAIWhisperProvider(
        this.config.openaiWhisper,
      );
      await openaiProvider.initialize();
      this.providers.set(openaiProvider.name, openaiProvider);
    }

    // Select active provider
    this.selectProvider();
    this.initialized = true;
  }

  /**
   * Select the active provider based on config and availability
   */
  private selectProvider(): void {
    if (this.config.provider === "local-whisper") {
      this.activeProvider = this.providers.get("local-whisper") || null;
    } else if (this.config.provider === "openai-whisper") {
      this.activeProvider = this.providers.get("openai-whisper") || null;
    } else {
      // Auto mode: prefer local, fall back to OpenAI
      const local = this.providers.get("local-whisper");
      const openai = this.providers.get("openai-whisper");

      if (local?.isAvailable) {
        this.activeProvider = local;
      } else if (openai?.isAvailable) {
        this.activeProvider = openai;
      }
    }

    if (this.activeProvider) {
      logger.info(
        { provider: this.activeProvider.name },
        "Transcription provider selected",
      );
    } else {
      logger.warn("No transcription provider available");
    }
  }

  /**
   * Transcribe an audio file using the active provider
   */
  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.activeProvider || !this.activeProvider.isAvailable) {
      logger.warn("No transcription provider available");

      return { text: "[Audio message - transcription unavailable]" };
    }

    return this.activeProvider.transcribe(audioPath);
  }

  /**
   * Get the name of the currently active provider
   */
  getActiveProviderName(): string | null {
    return this.activeProvider?.name || null;
  }

  /**
   * Get all registered providers
   */
  getProviders(): Map<string, TranscriptionProvider> {
    return this.providers;
  }

  /**
   * Manually set the active provider by name
   */
  setActiveProvider(name: string): boolean {
    const provider = this.providers.get(name);

    if (provider && provider.isAvailable) {
      this.activeProvider = provider;
      logger.info({ provider: name }, "Transcription provider changed");

      return true;
    }
    logger.warn({ provider: name }, "Provider not available");

    return false;
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        await provider.shutdown();
        logger.debug({ provider: name }, "Provider shutdown");
      } catch (error) {
        logger.error({ error, provider: name }, "Provider shutdown failed");
      }
    }
    this.providers.clear();
    this.activeProvider = null;
    this.initialized = false;
  }
}

// Singleton instance
export const transcriptionService = new TranscriptionService();

// Convenience function for backward compatibility
export async function transcribeAudio(
  audioPath: string,
): Promise<TranscriptionResult> {
  return transcriptionService.transcribe(audioPath);
}
