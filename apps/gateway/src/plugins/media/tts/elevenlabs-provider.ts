// apps/gateway/src/plugins/media/tts/elevenlabs-provider.ts

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
  ElevenLabsConfig,
} from "./types.js";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" - default ElevenLabs voice
const DEFAULT_MODEL_ID = "eleven_flash_v2_5"; // Fast, works on free tier

export class ElevenLabsProvider implements TTSProvider {
  readonly name = "elevenlabs";
  private apiKey: string | undefined;
  private voiceId: string;
  private modelId: string;
  private stability: number;
  private similarityBoost: number;
  private _isAvailable = false;

  constructor(config: ElevenLabsConfig = {}) {
    this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
    this.voiceId = config.voiceId || DEFAULT_VOICE_ID;
    this.modelId = config.modelId || DEFAULT_MODEL_ID;
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.75;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      logger.error("ElevenLabs TTS provider unavailable: ELEVENLABS_API_KEY not set in environment");
      return;
    }

    // Test with a minimal TTS request to verify the API key works
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: "ok",
            model_id: this.modelId,
          }),
        }
      );

      if (response.ok) {
        this._isAvailable = true;
        logger.info({ voiceId: this.voiceId, modelId: this.modelId }, "ElevenLabs provider initialized");
      } else {
        const error = await response.text();
        logger.warn({ status: response.status, error }, "ElevenLabs API key validation failed");
      }
    } catch (error) {
      logger.warn({ error }, "ElevenLabs provider initialization failed");
    }
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this._isAvailable || !this.apiKey) {
      throw new Error("ElevenLabs provider not available");
    }

    const voiceId = options?.voice || this.voiceId;
    const outputFormat = options?.format === "wav" ? "pcm_44100" : "mp3_44100_128";

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: this.modelId,
            output_format: outputFormat,
            voice_settings: {
              stability: this.stability,
              similarity_boost: this.similarityBoost,
              speed: options?.speed ?? 1.0,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body from ElevenLabs");
      }

      // Save to file
      const audioDir = getTTSOutputDir();
      const ext = options?.format === "wav" ? "wav" : "mp3";
      const filename = `${uuid()}.${ext}`;
      const audioPath = join(audioDir, filename);

      const fileStream = createWriteStream(audioPath);
      await pipeline(Readable.fromWeb(response.body), fileStream);

      logger.debug(
        { audioPath, textLength: text.length, provider: this.name },
        "Text synthesized to speech"
      );

      return {
        audioPath,
        mimeType: ext === "wav" ? "audio/wav" : "audio/mpeg",
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
