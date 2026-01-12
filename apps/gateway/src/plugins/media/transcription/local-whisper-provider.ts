// apps/gateway/src/plugins/media/transcription/local-whisper-provider.ts

import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  unlinkSync,
  readFileSync,
} from "fs";
import { join, dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { tmpdir } from "os";
import { config as gatewayConfig } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import type {
  TranscriptionProvider,
  TranscriptionResult,
  LocalWhisperConfig,
} from "./types.js";

const MODEL_URLS: Record<string, string> = {
  tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  "tiny.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  "base.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  small:
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  "small.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  medium:
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
  "medium.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
  large:
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
};

export class LocalWhisperProvider implements TranscriptionProvider {
  readonly name = "local-whisper";
  private modelPath: string;
  private modelSize: string;
  private language: string;
  private threads: number;
  private whisperBinary: string | null = null;
  private _isAvailable = false;

  constructor(config: LocalWhisperConfig = {}) {
    const modelsDir = join(gatewayConfig.dataDir, "models", "whisper");
    this.modelSize = config.modelSize || "base.en";

    this.modelPath =
      config.modelPath || join(modelsDir, `ggml-${this.modelSize}.bin`);

    this.language = config.language || "en";
    this.threads = config.threads || 4;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  async initialize(): Promise<void> {
    // Find whisper-cli binary
    this.whisperBinary = await this.findWhisperBinary();

    if (!this.whisperBinary) {
      logger.warn(
        "Local Whisper provider: whisper-cli not found. Install with: brew install whisper-cpp",
      );

      return;
    }

    // Check/download model
    if (!existsSync(this.modelPath)) {
      const modelUrl = MODEL_URLS[this.modelSize];

      if (modelUrl) {
        logger.info(
          { modelSize: this.modelSize, path: this.modelPath },
          "Downloading Whisper model...",
        );

        await this.downloadModel(modelUrl, this.modelPath);
      } else {
        logger.warn({ modelPath: this.modelPath }, "Whisper model not found");

        return;
      }
    }

    this._isAvailable = true;

    logger.info(
      { binary: this.whisperBinary, model: this.modelPath },
      "Local Whisper provider initialized",
    );
  }

  private async findWhisperBinary(): Promise<string | null> {
    // Check environment variable first
    if (
      process.env.WHISPER_CPP_PATH &&
      existsSync(process.env.WHISPER_CPP_PATH)
    ) {
      return process.env.WHISPER_CPP_PATH;
    }

    // Common installation paths for whisper-cli (homebrew whisper-cpp)
    const candidates = [
      "/opt/homebrew/bin/whisper-cli",
      "/usr/local/bin/whisper-cli",
      join(gatewayConfig.dataDir, "bin", "whisper-cli"),
    ];

    // Check PATH
    const pathDirs = (process.env.PATH || "").split(":");

    for (const dir of pathDirs) {
      candidates.push(join(dir, "whisper-cli"));
    }

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // Try which command
    try {
      const result = await this.runCommand("which", ["whisper-cli"]);
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

    // whisper-cli outputs to a file, so we need a temp output path
    const outputBase = join(tmpdir(), `whisper-${Date.now()}`);
    const outputJson = `${outputBase}.json`;

    // Convert to WAV if needed (whisper-cli is picky about formats)
    let wavPath: string | null = null;
    let inputPath = audioPath;

    if (!audioPath.toLowerCase().endsWith(".wav")) {
      wavPath = `${outputBase}.wav`;
      try {
        await this.convertToWav(audioPath, wavPath);
        inputPath = wavPath;
      } catch (error) {
        logger.warn(
          { error, audioPath },
          "Audio conversion failed, trying original file",
        );
      }
    }

    try {
      // whisper-cli args
      const args = [
        "-m",
        this.modelPath,
        "-t",
        String(this.threads),
        "-l",
        this.language === "auto" ? "auto" : this.language,
        "-oj", // Output JSON
        "-of",
        outputBase, // Output file base (adds .json)
        "-np", // No prints (cleaner output)
        inputPath,
      ];

      await this.runCommand(this.whisperBinary, args);

      // Read JSON output
      if (!existsSync(outputJson)) {
        throw new Error("Whisper did not produce output file");
      }

      const jsonOutput = JSON.parse(readFileSync(outputJson, "utf-8"));

      // Extract text from transcription array
      const text =
        jsonOutput.transcription
          ?.map((seg: { text: string }) => seg.text.trim())
          .join(" ")
          .trim() || "";

      logger.debug(
        { audioPath, textLength: text.length, provider: this.name },
        "Audio transcribed",
      );

      return {
        text,
        language: this.language,
        segments: jsonOutput.transcription?.map(
          (seg: {
            timestamps: { from: string; to: string };
            text: string;
          }) => ({
            start: parseTimestamp(seg.timestamps.from),
            end: parseTimestamp(seg.timestamps.to),
            text: seg.text.trim(),
          }),
        ),
      };
    } catch (error) {
      logger.error(
        { error, audioPath, provider: this.name },
        "Local transcription failed",
      );

      return { text: "[Audio message - transcription failed]" };
    } finally {
      // Clean up temp files
      for (const file of [outputJson, wavPath]) {
        if (file && existsSync(file)) {
          try {
            unlinkSync(file);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }
  }

  private async convertToWav(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    // Convert to 16kHz mono WAV (whisper's preferred format)
    await this.runCommand("ffmpeg", [
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-y",
      outputPath,
    ]);

    logger.debug({ inputPath, outputPath }, "Audio converted to WAV");
  }

  async shutdown(): Promise<void> {
    // No persistent resources to clean up
  }
}

// Parse timestamp like "00:00:00,000" to seconds
function parseTimestamp(ts: string): number {
  const match = ts.match(/(\d+):(\d+):(\d+),(\d+)/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;

  return (
    parseInt(h!) * 3600 +
    parseInt(m!) * 60 +
    parseInt(s!) +
    parseInt(ms!) / 1000
  );
}
