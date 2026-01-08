import { createFileRoute } from "@tanstack/react-router";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages } from "ai";
import { buildSystemPrompt } from "../../lib/prompts";
import { SessionManager } from "../../lib/session";

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
        const modelMessages = await convertToModelMessages(messages);

        const result = streamText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          messages: modelMessages,
          onFinish: async ({ text }) => {
            // Persist assistant response after streaming completes
            session.appendMessage("assistant", text);
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
