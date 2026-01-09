import { createFileRoute } from "@tanstack/react-router";
import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  generateText,
  convertToModelMessages,
  stepCountIs,
  validateUIMessages,
  createIdGenerator,
} from "ai";
import { buildSystemPrompt } from "../../lib/prompts";
import { SessionManager } from "../../lib/session";
import { createTools } from "@/lib/agent/tools";
import type { MessageRole, UIMessagePart } from "../../lib/session/types";

async function generateSessionName(messages: string[]): Promise<string> {
  const result = await generateText({
    model: anthropic("claude-3-5-haiku-latest"),
    system:
      "Generate a short, concise session name (2-5 words) that captures the main topic of the conversation. Return ONLY the name, nothing else.",
    prompt: `Based on these user messages, what is the topic?\n\n${messages.join("\n\n")}`,
  });

  return result.text.trim();
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { message, sessionId } = await request.json();

        // Normalize sessionId - treat empty strings and "undefined" as undefined
        const normalizedSessionId =
          sessionId && sessionId !== "undefined" ? sessionId : undefined;
        const session = new SessionManager(normalizedSessionId);
        const systemPrompt = buildSystemPrompt();

        const previousMessages = session.getMessages();

        // Count user messages for session naming
        const previousUserMessages = previousMessages.filter(
          (m) => m.role === "user",
        );
        const userMessageCount = previousUserMessages.length + 1;

        // Save the user's message to the session
        session.appendStructuredMessage(
          message.role as MessageRole,
          message.parts as UIMessagePart[],
        );

        // Generate session name on 1st and 3rd user messages
        if (userMessageCount === 1 || userMessageCount === 3) {
          const allUserMessages = [...previousUserMessages, message];
          const userTexts = allUserMessages.map((m) => {
            const parts = m.parts || m.content;

            if (Array.isArray(parts)) {
              return parts
                .filter((p: UIMessagePart) => p.type === "text")
                .map(
                  (p: UIMessagePart) =>
                    (p as { type: "text"; text: string }).text,
                )
                .join(" ");
            }

            return "";
          });

          // Run in background to not block the response
          generateSessionName(userTexts).then((name) => {
            session.updateName(name);
          });
        }

        const messages = [...previousMessages, message];

        const tools = createTools({ session });

        const validatedMessages = await validateUIMessages({
          messages,
        });

        const result = streamText({
          model: anthropic("claude-sonnet-4-5"),
          system: systemPrompt,
          messages: await convertToModelMessages(validatedMessages),
          stopWhen: stepCountIs(250), // Allow up to 5 steps for tool calls + response
          tools,
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
          generateMessageId: createIdGenerator({
            prefix: "msg",
            size: 16,
          }),
          onFinish: async ({ messages: finalMessages }) => {
            // Find messages that weren't in the original set and persist them
            const originalIds = new Set(messages.map((m) => m.id));

            for (const msg of finalMessages) {
              if (!originalIds.has(msg.id)) {
                session.appendStructuredMessage(
                  msg.role as MessageRole,
                  msg.parts as UIMessagePart[],
                );
              }
            }
          },
        });

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
