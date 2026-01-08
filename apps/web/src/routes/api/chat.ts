import { createFileRoute } from "@tanstack/react-router";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { buildSystemPrompt } from "../../lib/prompts";
import { SessionManager } from "../../lib/session";

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
        if (lastUserMessage?.content) {
          session.appendMessage("user", lastUserMessage.content);
        }

        const result = streamText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: systemPrompt,
          messages,
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
