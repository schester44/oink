// apps/gateway/src/plugins/media/index.ts

export { storeMedia, storeMediaFromBuffer, type StoredMedia } from "./storage.js";
export {
  transcribeAudio,
  transcriptionService,
  type TranscriptionConfig,
  type TranscriptionResult,
} from "./transcription/index.js";
