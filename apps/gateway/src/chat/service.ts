/**
 * Chat Service - Utility functions for chat
 *
 * Note: Main chat streaming has been moved to agent-service.ts which uses
 * @mariozechner/pi-coding-agent for session management and LLM interaction.
 *
 * This file retains utility functions like session name generation.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

/**
 * Generate a session name from messages.
 */
export async function generateSessionName(messages: string[]): Promise<string> {
  const result = await generateText({
    model: anthropic("claude-3-5-haiku-latest"),
    system:
      "Generate a short, concise session name (2-5 words) that captures the main topic of the conversation. Return ONLY the name, nothing else.",
    prompt: `Based on these user messages, what is the topic?\n\n${messages.join("\n\n")}`,
  });

  return result.text.trim();
}
