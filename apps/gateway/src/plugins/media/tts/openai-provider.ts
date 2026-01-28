// apps/gateway/src/plugins/media/tts/openai-provider.ts

import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { v4 as uuid } from "uuid";
import { config as gatewayConfig } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import type {
  TTSProvider,
  TTSResult,
  TTSOptions,
  OpenAITTSConfig,
} from "./types.js";

export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai-tts";
  private apiKey: string | undefined;
  private voice: string;
  private model: string;
  private speed: number;
  private _isAvailable = false;

  constructor(config: OpenAITTSConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.voice = config.voice || "nova";
    this.model = config.model || "tts-1";
    this.speed = config.speed ?? 1.0;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      logger.error("OpenAI TTS provider unavailable: OPENAI_API_KEY not set in environment");
      return;
    }

    this._isAvailable = true;
    logger.info({ voice: this.voice, model: this.model }, "OpenAI TTS provider initialized");
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this._isAvailable || !this.apiKey) {
      throw new Error("OpenAI TTS provider not available");
    }

    const voice = options?.voice || this.voice;
    const responseFormat = options?.format === "wav" ? "wav" : 
                          options?.format === "ogg" ? "opus" : "mp3";

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          voice,
          response_format: responseFormat,
          speed: options?.speed ?? this.speed,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI TTS API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body from OpenAI TTS");
      }

      // Save to file
      const audioDir = getTTSOutputDir();
      const ext = responseFormat === "opus" ? "ogg" : responseFormat;
      const filename = `${uuid()}.${ext}`;
      const audioPath = join(audioDir, filename);

      const fileStream = createWriteStream(audioPath);
      await pipeline(Readable.fromWeb(response.body), fileStream);

      logger.debug(
        { audioPath, textLength: text.length, provider: this.name },
        "Text synthesized to speech"
      );

      const mimeTypes: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
      };

      return {
        audioPath,
        mimeType: mimeTypes[ext] || "audio/mpeg",
      };
    } catch (error) {
      logger.error({ error, provider: this.name }, "TTS synthesis failed");
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // No cleanup needed for API-based provider
  }
}

function getTTSOutputDir(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dir = join(gatewayConfig.dataDir, "media", "tts", String(year), month);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  return dir;
}
