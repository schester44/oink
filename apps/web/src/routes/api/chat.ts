import { createFileRoute } from "@tanstack/react-router";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages, stepCountIs, type ModelMessage } from "ai";
import { buildSystemPrompt } from "../../lib/prompts";
import { SessionManager } from "../../lib/session";
import type { MessagePart } from "../../lib/session/types";
import z from "zod";
import { createTools } from "@/lib/agent/tools";

// Helper to extract text from UI message parts
function getTextFromParts(
  parts?: Array<{ type: string; text?: string }>,
): string {
  if (!parts) return "";

  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("");
}

// Filter out messages with empty content to avoid API errors
function sanitizeMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((msg) => {
    console.log("\x1b[33m%s\x1b[0m", "🪵 msg", msg);
    if (!msg.content) return false;
    if (Array.isArray(msg.content) && msg.content.length === 0) return false;
    if (typeof msg.content === "string" && msg.content.trim() === "")
      return false;

    return true;
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, sessionId } = await request.json();

        // Normalize sessionId - treat empty strings and "undefined" as undefined
        const normalizedSessionId =
          sessionId && sessionId !== "undefined" ? sessionId : undefined;
        const session = new SessionManager(normalizedSessionId);
        const systemPrompt = buildSystemPrompt();

        // Get the last user message to persist
        const lastUserMessage = messages
          .filter((m: { role: string }) => m.role === "user")
          .pop();

        if (lastUserMessage) {
          const textContent = getTextFromParts(lastUserMessage.parts);

          if (textContent) {
            session.appendMessage("user", textContent);
          }
        }

        // Convert UI messages to model messages for streamText
        const modelMessages = sanitizeMessages(
          await convertToModelMessages(messages),
        );

        const result = streamText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          messages: modelMessages,
          stopWhen: stepCountIs(5), // Allow up to 5 steps for tool calls + response
          onFinish: async ({ text, steps }) => {
            // Build structured message parts from all steps
            const parts: MessagePart[] = [];

            for (const step of steps) {
              // Add text content if present
              if (step.text) {
                parts.push({ type: "text", text: step.text });
              }

              // Add tool calls with their results
              if (step.toolCalls) {
                for (const toolCall of step.toolCalls) {
                  const toolResult = step.toolResults?.find(
                    (r: { toolCallId: string }) => r.toolCallId === toolCall.toolCallId
                  );
                  parts.push({
                    type: "tool-call",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    input: toolCall.input,
                    output: (toolResult as { output?: unknown })?.output,
                    state: toolResult ? "output-available" : "pending",
                  });
                }
              }
            }

            // Persist as structured message if we have parts, otherwise fall back to text
            if (parts.length > 0) {
              session.appendStructuredMessage("assistant", parts);
            } else if (text) {
              session.appendMessage("assistant", text);
            }
          },
          tools: {
            ...createTools(),
            getWeatherInformation: {
              description: "show the weather in a given city to the user",
              inputSchema: z.object({ city: z.string() }),
              execute: async ({ city }: { city: string }) => {
                console.log("\x1b[33m%s\x1b[0m", "🪵 city", city);

                const weatherOptions = [
                  "sunny",
                  "cloudy",
                  "rainy",
                  "snowy",
                  "windy",
                ];

                return weatherOptions[
                  Math.floor(Math.random() * weatherOptions.length)
                ];
              },
            },
          },
        });

        const response = result.toUIMessageStreamResponse();

        // Add session ID header to the response
        const headers = new Headers(response.headers);
        headers.set("X-Session-Id", session.sessionId);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      },
    },
  },
});
