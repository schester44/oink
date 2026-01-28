/**
 * Response Mode Tool
 * 
 * Allows the LLM to set the preferred response mode (voice or text) for the current chat.
 * The user can say things like "respond with audio from now on" or "switch to text responses".
 */

import { Type, type Static } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { logger } from "../../lib/logger.js";

export type ResponseMode = "voice" | "text" | "auto";

// Store response mode preferences per session
const responseModePreferences = new Map<string, ResponseMode>();

/**
 * Get the response mode preference for a session.
 * Returns "auto" if no preference is set.
 */
export function getResponseModePreference(sessionId: string): ResponseMode {
  return responseModePreferences.get(sessionId) ?? "auto";
}

/**
 * Set the response mode preference for a session.
 */
export function setResponseModePreference(sessionId: string, mode: ResponseMode): void {
  const previousMode = responseModePreferences.get(sessionId) ?? "auto";
  
  if (mode === "auto") {
    responseModePreferences.delete(sessionId);
  } else {
    responseModePreferences.set(sessionId, mode);
  }
  
  logger.info(
    { sessionId, previousMode, newMode: mode },
    `Response mode changed: ${previousMode} → ${mode}`
  );
}

/**
 * Clear all response mode preferences (for cleanup/testing).
 */
export function clearResponseModePreferences(): void {
  responseModePreferences.clear();
}

interface ResponseModeToolOptions {
  sessionId: string;
}

// TypeBox schema for parameters
const ResponseModeParams = Type.Object({
  mode: Type.Union([
    Type.Literal("voice"),
    Type.Literal("text"),
    Type.Literal("auto"),
  ], {
    description: 'The response mode: "voice" for audio responses, "text" for text only, "auto" for default behavior',
  }),
});

type ResponseModeParamsType = Static<typeof ResponseModeParams>;

/**
 * Create the response mode tool definition.
 */
export function createResponseModeToolDefinition(
  options: ResponseModeToolOptions
): ToolDefinition<typeof ResponseModeParams> {
  const { sessionId } = options;

  return {
    name: "set_response_mode",
    label: "Set Response Mode",
    description: `Set how you should respond to the user in this chat. Use this when the user asks you to respond with voice/audio, text, or to go back to automatic mode.

Modes:
- "voice": Always respond with voice/audio (text-to-speech)
- "text": Always respond with text only
- "auto": Use the default behavior (voice replies to voice messages if TTS is enabled)

Examples of when to use this:
- User says "respond with audio from now on" → set mode to "voice"
- User says "switch to text responses" → set mode to "text"  
- User says "go back to normal" → set mode to "auto"`,
    parameters: ResponseModeParams,
    execute: async (
      _toolCallId: string,
      params: ResponseModeParamsType,
      _onUpdate: unknown,
      _ctx: unknown,
      _signal?: AbortSignal
    ) => {
      const { mode } = params;
      setResponseModePreference(sessionId, mode);
      
      const modeDescriptions: Record<ResponseMode, string> = {
        voice: "I'll now respond with voice messages.",
        text: "I'll now respond with text only.",
        auto: "I'll now use the default response mode (voice replies to voice messages when TTS is enabled).",
      };
      
      return {
        content: [{ type: "text" as const, text: modeDescriptions[mode] }],
        details: { mode, sessionId },
      };
    },
  };
}
