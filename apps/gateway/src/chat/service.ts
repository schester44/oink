import {
  streamText,
  generateText,
  stepCountIs,
  createIdGenerator,
  type ModelMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { StreamChunk, ChatRequest, ChatMessage } from "./types.js";
import { SessionManager } from "../session/index.js";
import { buildSystemPrompt } from "./prompts.js";
import { createTools } from "../agent/tools.js";
import { logger } from "../logger.js";
import type { UIMessagePart, ImagePart } from "../session/types.js";
import { initializeBrain } from "@/brain/brain.js";
import { config } from "@/config.js";
import { recordLLMRequest } from "@/lib/telemetry/index.js";
import { readSettings } from "@/lib/settings.js";

type NormalizedPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType: string };

/**
 * Normalize a message to ensure it has `parts` array.
 * Messages may come with either `parts` or `content`.
 * Handles both text and image parts for vision support.
 */
function normalizeMessageParts(message: ChatMessage): NormalizedPart[] {
  if (message.parts && message.parts.length > 0) {
    const result: NormalizedPart[] = [];
    for (const p of message.parts) {
      if (p.type === "text" && typeof p.text === "string") {
        result.push({ type: "text", text: p.text });
      } else if (p.type === "image" && typeof p.image === "string") {
        result.push({
          type: "image",
          image: p.image as string,
          mimeType: (p.mimeType as string) || "image/jpeg",
        });
      }
    }
    return result.length > 0 ? result : [{ type: "text", text: message.content }];
  }

  return [{ type: "text", text: message.content }];
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
  const { sessionId, instanceId, message, sourceChannel } = request;

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

    // Save user message to session (cast to UIMessagePart for storage)
    session.appendStructuredMessage({
      role: message.role,
      parts: normalizedParts as UIMessagePart[],
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

    // Build model messages directly (bypassing validateUIMessages which doesn't support images)
    // ModelMessage is a discriminated union - we need to build user/assistant messages separately
    const modelMessages: ModelMessage[] = [];

    for (const m of previousMessages) {
      const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [];

      for (const p of m.parts as UIMessagePart[]) {
        // Include text parts with valid string content
        if (p.type === "text" && "text" in p && typeof p.text === "string" && p.text.length > 0) {
          content.push({ type: "text", text: p.text });
        } else if (p.type === "image" && "image" in p && typeof (p as ImagePart).image === "string") {
          // Format image for AI SDK: base64 data URL
          const imagePart = p as { image: string; mimeType?: string };
          const mimeType = imagePart.mimeType || "image/jpeg";
          content.push({
            type: "image",
            image: `data:${mimeType};base64,${imagePart.image}`,
          });
        }
      }

      // Skip messages with no valid content
      if (content.length === 0) continue;

      // Build properly typed CoreMessage based on role
      if (m.role === "user") {
        modelMessages.push({ role: "user", content });
      } else if (m.role === "assistant") {
        // Assistant messages only support text content
        const textContent = content.filter((c): c is { type: "text"; text: string } => c.type === "text");
        if (textContent.length > 0) {
          modelMessages.push({ role: "assistant", content: textContent });
        }
      }
    }

    // Create tools
    const tools = createTools({ session, instanceId, sourceChannel });

    // Stream the response using toUIMessageStream for proper AI SDK format
    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system: systemPrompt,
      messages: modelMessages,
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
