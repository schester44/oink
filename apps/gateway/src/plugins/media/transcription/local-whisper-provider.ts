// apps/gateway/src/plugins/media/transcription/local-whisper-provider.ts

import { spawn } from "child_process";
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from "fs";
import { join, dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { config as gatewayConfig } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import type {
  TranscriptionProvider,
  TranscriptionResult,
  LocalWhisperConfig,
} from "./types.js";

const MODEL_URLS: Record<string, string> = {
  "tiny": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  "tiny.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  "base": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  "base.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  "small": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  "small.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  "medium": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
  "medium.en": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
  "large": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
};

export class LocalWhisperProvider implements TranscriptionProvider {
  readonly name = "local-whisper";
  private modelPath: string;
  private language: string;
  private threads: number;
  private whisperBinary: string | null = null;
  private _isAvailable = false;

  constructor(config: LocalWhisperConfig = {}) {
    const modelsDir = join(gatewayConfig.dataDir, "models", "whisper");
    const modelSize = config.modelSize || "base.en";
    
    this.modelPath = config.modelPath || join(modelsDir, `ggml-${modelSize}.bin`);
    this.language = config.language || "en";
    this.threads = config.threads || 4;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  async initialize(): Promise<void> {
    // Find whisper binary
    this.whisperBinary = await this.findWhisperBinary();
    
    if (!this.whisperBinary) {
      logger.warn(
        "Local Whisper provider: whisper binary not found. Install whisper.cpp or set WHISPER_CPP_PATH"
      );
      return;
    }

    // Check/download model
    if (!existsSync(this.modelPath)) {
      const modelSize = this.modelPath.match(/ggml-(\w+(?:\.\w+)?).bin/)?.[1];
      
      if (modelSize && MODEL_URLS[modelSize]) {
        logger.info({ modelSize, path: this.modelPath }, "Downloading Whisper model...");
        await this.downloadModel(MODEL_URLS[modelSize], this.modelPath);
      } else {
        logger.warn({ modelPath: this.modelPath }, "Whisper model not found");
        return;
      }
    }

    this._isAvailable = true;
    logger.info(
      { binary: this.whisperBinary, model: this.modelPath },
      "Local Whisper provider initialized"
    );
  }

  private async findWhisperBinary(): Promise<string | null> {
    // Check environment variable first
    if (process.env.WHISPER_CPP_PATH && existsSync(process.env.WHISPER_CPP_PATH)) {
      return process.env.WHISPER_CPP_PATH;
    }

    // Common installation paths
    const candidates = [
      "/usr/local/bin/whisper",
      "/usr/local/bin/whisper-cpp",
      "/opt/homebrew/bin/whisper",
      "/opt/homebrew/bin/whisper-cpp",
      join(gatewayConfig.dataDir, "bin", "whisper"),
    ];

    // Check PATH
    const pathDirs = (process.env.PATH || "").split(":");
    for (const dir of pathDirs) {
      candidates.push(join(dir, "whisper"));
      candidates.push(join(dir, "whisper-cpp"));
    }

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // Try which command
    try {
      const result = await this.runCommand("which", ["whisper"]);
      if (result.trim()) return result.trim();
    } catch {
      // Ignore
    }

    return null;
  }

  private async downloadModel(url: string, destPath: string): Promise<void> {
    const dir = dirname(destPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download model: ${response.status}`);
    }

    const fileStream = createWriteStream(destPath);
    // @ts-expect-error - Node.js stream compatibility
    await pipeline(Readable.fromWeb(response.body), fileStream);
    
    logger.info({ path: destPath }, "Whisper model downloaded");
  }

  private runCommand(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => (stdout += data.toString()));
      proc.stderr.on("data", (data) => (stderr += data.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${stderr || stdout}`));
        }
      });

      proc.on("error", reject);
    });
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    if (!this._isAvailable || !this.whisperBinary) {
      return { text: "[Audio message - local transcription unavailable]" };
    }

    // Convert audio to WAV if needed (whisper.cpp prefers WAV)
    let wavPath = audioPath;
    let needsCleanup = false;

    if (!audioPath.endsWith(".wav")) {
      wavPath = audioPath.replace(/\.[^.]+$/, ".wav");
      try {
        await this.convertToWav(audioPath, wavPath);
        needsCleanup = true;
      } catch (error) {
        logger.warn({ error }, "Audio conversion failed, trying original file");
        wavPath = audioPath;
      }
    }

    try {
      const args = [
        "-m", this.modelPath,
        "-f", wavPath,
        "-t", String(this.threads),
        "-l", this.language === "auto" ? "auto" : this.language,
        "--output-txt",
        "--no-timestamps",
      ];

      const output = await this.runCommand(this.whisperBinary, args);
      
      // Parse output - whisper.cpp outputs text directly
      const text = output.trim();

      logger.debug(
        { audioPath, textLength: text.length, provider: this.name },
        "Audio transcribed"
      );

      return { text, language: this.language };
    } catch (error) {
      logger.error({ error, audioPath, provider: this.name }, "Local transcription failed");
      return { text: "[Audio message - transcription failed]" };
    } finally {
      // Clean up converted file
      if (needsCleanup && existsSync(wavPath)) {
        try {
          unlinkSync(wavPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  private async convertToWav(inputPath: string, outputPath: string): Promise<void> {
    // Use ffmpeg to convert to 16kHz mono WAV (whisper's preferred format)
    await this.runCommand("ffmpeg", [
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      "-y",
      outputPath,
    ]);
  }

  async shutdown(): Promise<void> {
    // No persistent resources to clean up
  }
}
