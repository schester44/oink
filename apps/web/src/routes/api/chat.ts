import { createAPIFileRoute } from "@tanstack/react-start/api";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type Message } from "ai";
import { buildSystemPrompt } from "../../lib/prompts";
import { SessionManager } from "../../lib/session";

export const APIRoute = createAPIFileRoute("/api/chat")({
  POST: async ({ request }) => {
    const { messages, sessionId }: { messages: Message[]; sessionId?: string } =
      await request.json();

    // Normalize sessionId - treat empty strings and "undefined" as undefined
    const normalizedSessionId =
      sessionId && sessionId !== "undefined" ? sessionId : undefined;
    const session = new SessionManager(normalizedSessionId);
    const systemPrompt = buildSystemPrompt();

    // Get the last user message to persist
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
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

    return result.toDataStreamResponse({
      headers: {
        "X-Session-Id": session.sessionId,
      },
    });
  },
});
