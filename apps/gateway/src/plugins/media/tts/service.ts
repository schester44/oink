// apps/gateway/src/plugins/media/tts/service.ts

import { logger } from "../../../lib/logger.js";
import type { TTSProvider, TTSResult, TTSOptions, TTSConfig } from "./types.js";
import { ElevenLabsProvider } from "./elevenlabs-provider.js";
import { OpenAITTSProvider } from "./openai-provider.js";

class TTSService {
  private providers = new Map<string, TTSProvider>();
  private activeProvider: TTSProvider | null = null;
  private config: TTSConfig = { enabled: false, provider: "auto" };
  private initialized = false;

  /**
   * Configure the TTS service
   */
  configure(config: TTSConfig): void {
    this.config = config;
  }

  /**
   * Check if TTS is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.activeProvider?.isAvailable === true;
  }

  /**
   * Check if we should only reply with voice when user sent voice
   */
  isVoiceReplyOnly(): boolean {
    return this.config.voiceReplyOnly ?? false;
  }

  /**
   * Initialize the service and available providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.config.enabled) {
      logger.debug("TTS service disabled");
      this.initialized = true;

      return;
    }

    // Register providers based on config
    if (
      this.config.provider === "elevenlabs" ||
      this.config.provider === "auto"
    ) {
      const provider = new ElevenLabsProvider(this.config.elevenlabs);
      await provider.initialize();
      this.providers.set(provider.name, provider);
    }

    if (this.config.provider === "openai" || this.config.provider === "auto") {
      const provider = new OpenAITTSProvider(this.config.openai);
      await provider.initialize();
      this.providers.set(provider.name, provider);
    }

    // Select active provider
    this.selectProvider();
    this.initialized = true;
  }

  /**
   * Select the active provider based on config and availability
   */
  private selectProvider(): void {
    if (this.config.provider === "elevenlabs") {
      this.activeProvider = this.providers.get("elevenlabs") || null;
    } else if (this.config.provider === "openai") {
      this.activeProvider = this.providers.get("openai-tts") || null;
    } else {
      // Auto mode: prefer ElevenLabs, fall back to OpenAI
      const elevenlabs = this.providers.get("elevenlabs");
      const openai = this.providers.get("openai-tts");

      if (elevenlabs?.isAvailable) {
        this.activeProvider = elevenlabs;
      } else if (openai?.isAvailable) {
        this.activeProvider = openai;
      }
    }

    if (this.activeProvider) {
      logger.info(
        { provider: this.activeProvider.name },
        "TTS provider selected",
      );
    } else if (this.config.enabled) {
      logger.error(
        { provider: this.config.provider },
        "TTS enabled but no provider available - check API key configuration (ELEVENLABS_API_KEY or OPENAI_API_KEY)",
      );
    }
  }

  /**
   * Synthesize text to speech using the active provider
   */
  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.activeProvider || !this.activeProvider.isAvailable) {
      throw new Error("No TTS provider available");
    }

    return this.activeProvider.synthesize(text, options);
  }

  /**
   * Get the name of the currently active provider
   */
  getActiveProviderName(): string | null {
    return this.activeProvider?.name || null;
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        await provider.shutdown();
        logger.debug({ provider: name }, "TTS provider shutdown");
      } catch (error) {
        logger.error({ error, provider: name }, "TTS provider shutdown failed");
      }
    }
    this.providers.clear();
    this.activeProvider = null;
    this.initialized = false;
  }
}

// Singleton instance
export const ttsService = new TTSService();
