// apps/gateway/src/plugins/media/transcription/index.ts

export * from "./types.js";
export { transcriptionService, transcribeAudio } from "./service.js";
export { LocalWhisperProvider } from "./local-whisper-provider.js";
export { OpenAIWhisperProvider } from "./openai-provider.js";
