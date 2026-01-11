// apps/gateway/src/plugins/adapters/telegram/media.ts

import type { Context } from "grammy";
import type { PhotoSize, Voice, Audio, Document } from "grammy/types";
import { storeMediaFromBuffer, transcribeAudio } from "../../media/index.js";
import { logger } from "../../../lib/logger.js";
import type { MessageContent } from "../../types.js";

async function downloadTelegramFile(
  ctx: Context,
  fileId: string
): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const filePath = file.file_path;

  if (!filePath) {
    throw new Error("File path not available");
  }

  // Construct the download URL
  const token = ctx.api.token;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function handlePhoto(
  ctx: Context,
  photos: PhotoSize[]
): Promise<MessageContent> {
  // Get largest photo
  const photo = photos.reduce((a, b) =>
    (a.file_size || 0) > (b.file_size || 0) ? a : b
  );

  try {
    const buffer = await downloadTelegramFile(ctx, photo.file_id);
    const stored = await storeMediaFromBuffer(buffer, { mimeType: "image/jpeg" });

    return {
      type: "image",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
    };
  } catch (error) {
    logger.error({ error, fileId: photo.file_id }, "Failed to handle photo");
    throw error;
  }
}

export async function handleVoice(
  ctx: Context,
  voice: Voice
): Promise<MessageContent> {
  try {
    const buffer = await downloadTelegramFile(ctx, voice.file_id);
    const stored = await storeMediaFromBuffer(buffer, { mimeType: voice.mime_type || "audio/ogg" });
    const transcription = await transcribeAudio(stored.localPath);

    return {
      type: "audio",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
      transcription: transcription.text,
    };
  } catch (error) {
    logger.error({ error, fileId: voice.file_id }, "Failed to handle voice");
    throw error;
  }
}

export async function handleAudio(
  ctx: Context,
  audio: Audio
): Promise<MessageContent> {
  try {
    const buffer = await downloadTelegramFile(ctx, audio.file_id);
    const stored = await storeMediaFromBuffer(buffer, {
      mimeType: audio.mime_type || "audio/mpeg",
      filename: audio.file_name,
    });
    const transcription = await transcribeAudio(stored.localPath);

    return {
      type: "audio",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
      transcription: transcription.text,
    };
  } catch (error) {
    logger.error({ error, fileId: audio.file_id }, "Failed to handle audio");
    throw error;
  }
}

export async function handleDocument(
  ctx: Context,
  document: Document
): Promise<MessageContent> {
  try {
    const buffer = await downloadTelegramFile(ctx, document.file_id);
    const stored = await storeMediaFromBuffer(buffer, {
      mimeType: document.mime_type || "application/octet-stream",
      filename: document.file_name,
    });

    return {
      type: "file",
      localPath: stored.localPath,
      mimeType: stored.mimeType,
      filename: document.file_name || "file",
    };
  } catch (error) {
    logger.error({ error, fileId: document.file_id }, "Failed to handle document");
    throw error;
  }
}
