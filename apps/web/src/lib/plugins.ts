import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trpcServer } from "./trpc-server";

export type { PluginsConfig, PluginConfig, TranscriptionConfig, TTSConfig } from "@pinky/trpc";

export const getPluginsServerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    return trpcServer.plugins.list.query();
  },
);

const updatePluginSchema = z.object({
  pluginId: z.string(),
  enabled: z.boolean(),
});

export const updatePluginServerFn = createServerFn({ method: "POST" })
  .inputValidator(updatePluginSchema)
  .handler(async ({ data }) => {
    return trpcServer.plugins.update.mutate(data);
  });

const transcriptionConfigSchema = z.object({
  provider: z.enum(["local-whisper", "openai-whisper", "auto"]),
  localWhisper: z.object({
    modelPath: z.string().optional(),
    modelSize: z.enum(["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large"]).optional(),
    language: z.string().optional(),
    threads: z.number().optional(),
  }).optional(),
  openaiWhisper: z.object({
    apiKey: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
}).optional();

export const updateTranscriptionServerFn = createServerFn({ method: "POST" })
  .inputValidator(transcriptionConfigSchema)
  .handler(async ({ data }) => {
    return trpcServer.plugins.updateTranscription.mutate(data);
  });

const ttsConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["elevenlabs", "openai", "auto"]),
  voiceReplyOnly: z.boolean().optional(),
  elevenlabs: z.object({
    apiKey: z.string().optional(),
    voiceId: z.string().optional(),
    modelId: z.string().optional(),
    stability: z.number().optional(),
    similarityBoost: z.number().optional(),
  }).optional(),
  openai: z.object({
    apiKey: z.string().optional(),
    voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
    model: z.enum(["tts-1", "tts-1-hd"]).optional(),
    speed: z.number().optional(),
  }).optional(),
}).optional();

export const updateTTSServerFn = createServerFn({ method: "POST" })
  .inputValidator(ttsConfigSchema)
  .handler(async ({ data }) => {
    return trpcServer.plugins.updateTTS.mutate(data);
  });
