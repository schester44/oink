// apps/gateway/src/plugins/media/transcription.ts

import { readFileSync } from "fs";
import { logger } from "../../lib/logger.js";

interface TranscriptionResult {
  text: string;
  language?: string;
}

export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn("OPENAI_API_KEY not set, skipping transcription");
    return { text: "[Audio message - transcription unavailable]" };
  }

  try {
    const audioBuffer = readFileSync(audioPath);
    const filename = audioPath.split("/").pop() || "audio.ogg";

    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), filename);
    formData.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} ${errorText}`);
    }

    const result = await response.json() as { text: string; language?: string };

    logger.debug({ audioPath, textLength: result.text.length }, "Audio transcribed");

    return {
      text: result.text,
      language: result.language,
    };
  } catch (error) {
    logger.error({ error, audioPath }, "Failed to transcribe audio");
    return { text: "[Audio message - transcription failed]" };
  }
}
