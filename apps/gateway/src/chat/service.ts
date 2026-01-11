import {
  streamText,
  generateText,
  stepCountIs,
  convertToModelMessages,
  validateUIMessages,
  createIdGenerator,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { StreamChunk, ChatRequest, ChatMessage } from "./types.js";
import { SessionManager } from "../session/index.js";
import { buildSystemPrompt } from "./prompts.js";
import { createTools } from "../agent/tools.js";
import { logger } from "../logger.js";
import type { UIMessagePart } from "../session/types.js";
import { initializeBrain } from "@/brain/brain.js";
import { config } from "@/config.js";
import { recordLLMRequest } from "@/lib/telemetry/index.js";
import { readSettings } from "@/lib/settings.js";

/**
 * Normalize a message to ensure it has `parts` array.
 * Messages may come with either `parts` or `content`.
 */
function normalizeMessageParts(
  message: ChatMessage,
): Array<{ type: "text"; text: string }> {
  if (message.parts && message.parts.length > 0) {
    // Filter to text parts only for simplicity
    return message.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string",
      )
      .map((p) => ({ type: "text" as const, text: p.text }));
  }

  return [{ type: "text" as const, text: message.content }];
}

/**
 * Extract text content from message parts for session naming.
 */
function extractTextFromParts(parts: UIMessagePart[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

/**
 * Stream a chat response - yields chunks as they arrive.
 * Transport-agnostic: can be consumed by WebSocket, HTTP, or any other transport.
 */
export async function* streamChat(
  request: ChatRequest,
): AsyncGenerator<StreamChunk> {
  const { sessionId, instanceId, message } = request;

  try {
    await initializeBrain({
      brainTemplatesDir: config.templatesDir,
      systemSkillsDir: config.systemSkillsDir,
      instanceId,
    });

    const session = new SessionManager({
      sessionId,
      instanceId,
    });

    const settings = readSettings();
    const systemPrompt = buildSystemPrompt({
      instanceId,
      userTimezone: settings.timezone,
    });

    // Normalize the incoming message parts
    const normalizedParts = normalizeMessageParts(message);

    // Save user message to session
    session.appendStructuredMessage({
      role: message.role,
      parts: normalizedParts,
    });

    const previousMessages = session.getMessages();

    const previousUserMessages = previousMessages.filter(
      (m) => m.role === "user",
    );

    const userMessageCount = previousUserMessages.length;

    // Generate session name on 1st and 3rd user messages
    if (userMessageCount === 1 || userMessageCount === 3) {
      const userTexts = previousUserMessages.map((m) =>
        extractTextFromParts(m.parts as UIMessagePart[]),
      );

      // Run in background to not block the response
      generateSessionName(userTexts).then((name) => {
        session.updateName(name);
      });
    }

    // Convert session messages to AI SDK format for validation
    // Only include text parts for the model
    const messagesForValidation = previousMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: (m.parts as UIMessagePart[])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => ({ type: "text" as const, text: p.text })),
    }));

    const validatedMessages = await validateUIMessages({
      messages: messagesForValidation,
    });

    // Create tools
    const tools = createTools({ session, instanceId });

    // Stream the response using toUIMessageStream for proper AI SDK format
    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system: systemPrompt,
      messages: await convertToModelMessages(validatedMessages),
      tools,
      stopWhen: stepCountIs(50),
    });

    const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });
    const collectedParts: UIMessagePart[] = [];
    let currentTextPart: { type: "text"; text: string } | null = null;
    // Track tool call parts by ID so we can update them with results
    const toolCallParts = new Map<
      string,
      {
        type: string;
        toolCallId: string;
        state: "call" | "partial-call" | "output-available" | "result";
        input?: Record<string, unknown>;
        output?: unknown;
      }
    >();

    // Use toUIMessageStream for proper chunk formatting
    for await (const chunk of result.toUIMessageStream({
      generateMessageId,
    })) {
      // Forward UI message chunks directly
      yield chunk as StreamChunk;

      // Collect parts for session persistence
      switch (chunk.type) {
        case "text-delta":
          // Accumulate text deltas into a single text part
          if (!currentTextPart) {
            currentTextPart = { type: "text", text: "" };
            collectedParts.push(currentTextPart);
          }
          currentTextPart.text += chunk.delta;
          break;

        case "start-step":
          // Finalize any pending text before step boundary
          currentTextPart = null;
          collectedParts.push({ type: "step-start" });
          break;

        case "tool-input-available": {
          // Only create new part if we haven't seen this tool call yet
          if (!toolCallParts.has(chunk.toolCallId)) {
            const toolPart = {
              type: `tool-${chunk.toolName}`,
              toolCallId: chunk.toolCallId,
              state: "call" as const,
              input: chunk.input as Record<string, unknown>,
            };
            toolCallParts.set(chunk.toolCallId, toolPart);
            collectedParts.push(toolPart);
          } else {
            // Update existing part with latest input
            const existingPart = toolCallParts.get(chunk.toolCallId)!;
            existingPart.input = chunk.input as Record<string, unknown>;
          }
          break;
        }

        case "tool-output-available": {
          // Find existing tool call part and update it with result
          const existingPart = toolCallParts.get(chunk.toolCallId);

          if (existingPart) {
            existingPart.state = "result";
            existingPart.output = chunk.output;
          }
          break;
        }
      }
    }

    // Get final usage for telemetry
    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    recordLLMRequest({
      inputTokens,
      outputTokens,
    });

    // Save assistant response to session with all parts (text + tool calls)
    session.appendStructuredMessage({
      role: "assistant",
      parts:
        collectedParts.length > 0
          ? collectedParts
          : [{ type: "text", text: "" }],
      usage: usage
        ? {
            inputTokens,
            outputTokens,
            totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
          }
        : undefined,
    });

    logger.info(
      {
        sessionId: session.sessionId,
        instanceId,
        usage,
      },
      "Chat stream completed",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error, instanceId }, "Chat stream failed");
    yield { type: "error", error: errorMessage };
  }
}

/**
 * Generate a single response (non-streaming).
 * Useful for scheduled tasks or simple completions.
 */
export async function generateChat(request: {
  instanceId: string;
  prompt: string;
  systemPromptOverride?: string;
}): Promise<{
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const { instanceId, prompt, systemPromptOverride } = request;

  const settings = readSettings();
  const systemPrompt =
    systemPromptOverride ||
    buildSystemPrompt({ instanceId, userTimezone: settings.timezone });

  const result = await generateText({
    model: anthropic("claude-sonnet-4-5"),
    system: systemPrompt,
    prompt,
    tools: createTools({ instanceId }),
    stopWhen: stepCountIs(50),
  });

  return {
    text: result.text,
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        }
      : undefined,
  };
}

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
