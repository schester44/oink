import { useState } from "react";
import Markdown from "react-markdown";
import { ToolCallDisplay } from "./tool-display";
import { GenerativeUIRenderer, shouldRenderAsGenerativeUI } from "./generative-ui/renderer";
import { hasGenerativeUI } from "./generative-ui";

type MessagePart = {
  type: string;
  text?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  [key: string]: unknown;
};

// Extract thinking blocks and remaining text from content
function parseThinkingBlocks(text: string): { thinking: string[]; content: string } {
  const thinkingBlocks: string[] = [];
  const content = text.replace(/<thinking>([\s\S]*?)<\/thinking>/g, (_, thought) => {
    thinkingBlocks.push(thought.trim());
    return "";
  }).trim();
  return { thinking: thinkingBlocks, content };
}

// Check if a message has any visible content
export function hasVisibleContent(message: { parts?: Array<MessagePart> }, showToolCalls = false): boolean {
  if (!message.parts || message.parts.length === 0) return false;

  return message.parts.some((part) => {
    if (part.type === "text" && part.text) {
      const { thinking, content } = parseThinkingBlocks(part.text);
      // Content is always visible; thinking is only visible when showToolCalls is on
      if (content.length > 0) return true;
      if (showToolCalls && thinking.length > 0) return true;
      return false;
    }
    // Generative UI parts (like weather cards) are always visible
    if (part.type.startsWith("tool-") && hasGenerativeUI(part)) {
      return true;
    }
    // Regular tool calls are visible when showToolCalls is on
    if (part.type.startsWith("tool-")) {
      return showToolCalls;
    }
    return false;
  });
}

function ThinkingCallout({ thoughts }: { thoughts: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (thoughts.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
      >
        <span className="text-base">💭</span>
        <span className="font-medium">Thinking...</span>
        <span className="ml-auto">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 text-xs text-purple-800 dark:text-purple-200 space-y-2">
          {thoughts.map((thought, i) => (
            <p key={i} className="whitespace-pre-wrap">{thought}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageContent({
  message,
  showToolCalls = false,
}: {
  message: {
    id: string;
    parts?: Array<MessagePart>;
  };
  showToolCalls?: boolean;
}) {
  if (!message.parts || message.parts.length === 0) return null;

  // Generate stable keys for each part
  let textIndex = 0;
  let stepIndex = 0;

  return (
    <>
      {message.parts.map((part) => {
        if (part.type === "text") {
          const key = `${message.id}-text-${textIndex++}`;
          // Show text even if empty during streaming (preserves layout)
          if (!part.text) return null;

          const { thinking, content } = parseThinkingBlocks(part.text);

          // If only thinking with no actual content, only render if showToolCalls is on
          if (!content && thinking.length > 0) {
            if (!showToolCalls) return null;
            return (
              <div key={key}>
                <ThinkingCallout thoughts={thinking} />
              </div>
            );
          }

          return (
            <div key={key}>
              {showToolCalls && <ThinkingCallout thoughts={thinking} />}
              {content && (
                <div className="text-sm prose prose-sm prose-neutral dark:prose-invert max-w-none">
                  <Markdown>{content}</Markdown>
                </div>
              )}
            </div>
          );
        }

        if (part.type === "step-start") {
          stepIndex++;
          return null;
        }

        // Handle tool parts (type starts with "tool-")
        if (part.type.startsWith("tool-")) {
          const key = part.toolCallId || `${message.id}-tool-${stepIndex}`;
          
          // Check for generative UI (always shown regardless of showToolCalls)
          if (shouldRenderAsGenerativeUI(part)) {
            return <GenerativeUIRenderer key={key} part={part} />;
          }
          
          // Regular tool calls only shown when showToolCalls is on
          if (!showToolCalls) return null;
          return <ToolCallDisplay key={key} part={part} />;
        }

        // Skip other internal parts
        return null;
      })}
    </>
  );
}
