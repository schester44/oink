// apps/gateway/src/plugins/media/transcription/openai-provider.ts

import { readFileSync } from "fs";
import { logger } from "../../../lib/logger.js";
import type {
  TranscriptionProvider,
  TranscriptionResult,
  OpenAIWhisperConfig,
} from "./types.js";

export class OpenAIWhisperProvider implements TranscriptionProvider {
  readonly name = "openai-whisper";
  private apiKey: string | undefined;
  private model: string;

  constructor(config: OpenAIWhisperConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || "whisper-1";
  }

  get isAvailable(): boolean {
    return !!this.apiKey;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      logger.warn("OpenAI Whisper provider: OPENAI_API_KEY not set");
    } else {
      logger.info("OpenAI Whisper provider initialized");
    }
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      return { text: "[Audio message - transcription unavailable: no API key]" };
    }

    try {
      const audioBuffer = readFileSync(audioPath);
      const filename = audioPath.split("/").pop() || "audio.ogg";

      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer]), filename);
      formData.append("model", this.model);
      formData.append("response_format", "verbose_json");

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error: ${response.status} ${errorText}`);
      }

      const result = (await response.json()) as {
        text: string;
        language?: string;
        duration?: number;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      logger.debug(
        { audioPath, textLength: result.text.length, provider: this.name },
        "Audio transcribed"
      );

      return {
        text: result.text,
        language: result.language,
        duration: result.duration,
        segments: result.segments?.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        })),
      };
    } catch (error) {
      logger.error({ error, audioPath, provider: this.name }, "Transcription failed");
      return { text: "[Audio message - transcription failed]" };
    }
  }

  async shutdown(): Promise<void> {
    // No cleanup needed for API-based provider
  }
}
