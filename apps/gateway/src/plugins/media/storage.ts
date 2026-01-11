// apps/gateway/src/plugins/media/storage.ts

import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { v4 as uuid } from "uuid";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export interface StoredMedia {
  localPath: string;
  mimeType: string;
  originalFilename?: string;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function getExtension(mimeType: string, filename?: string): string {
  if (filename) {
    const ext = filename.split(".").pop();
    // Only use extension if it contains safe characters
    if (ext && /^[a-zA-Z0-9]+$/.test(ext)) return ext;
  }
  return MIME_TO_EXT[mimeType] || "bin";
}

function getMediaDir(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return join(config.dataDir, "media", String(year), month);
}

export async function storeMedia(
  stream: Readable,
  metadata: { mimeType: string; filename?: string }
): Promise<StoredMedia> {
  const dir = getMediaDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const ext = getExtension(metadata.mimeType, metadata.filename);
  const filename = `${uuid()}.${ext}`;
  const localPath = join(dir, filename);

  try {
    const writeStream = createWriteStream(localPath);
    await pipeline(stream, writeStream);

    logger.debug({ localPath, mimeType: metadata.mimeType }, "Media stored");

    return {
      localPath,
      mimeType: metadata.mimeType,
      originalFilename: metadata.filename,
    };
  } catch (error) {
    logger.error({ error, localPath }, "Failed to store media");
    throw error;
  }
}

export async function storeMediaFromBuffer(
  buffer: Buffer,
  metadata: { mimeType: string; filename?: string }
): Promise<StoredMedia> {
  const stream = Readable.from(buffer);
  return storeMedia(stream, metadata);
}
